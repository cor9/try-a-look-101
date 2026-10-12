"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { Icon, Modal, Spinner, Swatch } from "./ui";
import { CATEGORY_LABELS, type ClosetItem, type ItemCategory, type ScannedItem } from "@/lib/types";
import { db } from "@/lib/client/db";
import { blobToDataUrl, cropPhoto, normalizePhoto } from "@/lib/client/images";
import { ApiError, postJson } from "@/lib/client/api";
import { MAX_IMPORT, categoryFromName, defaultItemName, expandFiles, filesFromDrop, guessColor, nameFromFile } from "@/lib/client/importer";
import { uid } from "@/lib/client/id";

interface Source {
  key: string;
  file: File;
  status: "queued" | "working" | "done" | "fallback" | "empty" | "error";
  note?: string;
  full?: Blob;
}

interface Card {
  key: string;
  sourceKey: string;
  name: string;
  category: ItemCategory;
  colorName: string;
  colorHex: string;
  description: string;
  location: string;
  photo: Blob;
  url: string;
  /** True when this card is one of several pieces cut from the same photo. */
  fromGroup: boolean;
  /** True when the card was filled in by the AI scanner (vs. filename + color guess). */
  ai: boolean;
  on: boolean;
}

const CONCURRENCY = 3;

/** Bulk import: photos from an album, a folder, a .zip or drag-and-drop become wardrobe cards. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { config, update, toast } = useStore();
  const [stage, setStage] = useState<"pick" | "working">("pick");
  const [sources, setSources] = useState<Source[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [notice, setNotice] = useState("");
  const [over, setOver] = useState(false);
  const stopRef = useRef(false);
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const photoInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const scanner = Boolean(config?.scannerEnabled);

  useEffect(() => () => cardsRef.current.forEach((c) => URL.revokeObjectURL(c.url)), []);

  const running = sources.some((s) => s.status === "queued" || s.status === "working");
  const done = sources.filter((s) => s.status !== "queued" && s.status !== "working").length;
  const chosen = cards.filter((c) => c.on);

  const setSource = (key: string, patch: Partial<Source>) =>
    setSources((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addCards = (more: Card[]) => setCards((all) => [...all, ...more]);

  const start = async (raw: File[]) => {
    const { images, skipped } = await expandFiles(raw);
    if (!images.length) {
      setNotice(skipped ? "No photos found in that selection. Try JPG, PNG, HEIC or a .zip of photos." : "");
      return;
    }
    const list = images.slice(0, MAX_IMPORT).map((file) => ({ key: uid("src"), file, status: "queued" as const }));
    const msgs = [];
    if (images.length > MAX_IMPORT) msgs.push(`Importing the first ${MAX_IMPORT} of ${images.length} photos.`);
    if (skipped) msgs.push(`Skipped ${skipped} file${skipped === 1 ? "" : "s"} that weren't photos.`);
    setNotice(msgs.join(" "));
    stopRef.current = false;
    setSources(list);
    setStage("working");

    let next = 0;
    let scanning = scanner;
    const worker = async () => {
      while (next < list.length) {
        const src = list[next++];
        if (stopRef.current) {
          setSource(src.key, { status: "error", note: "Stopped" });
          continue;
        }
        setSource(src.key, { status: "working" });
        try {
          const full = await normalizePhoto(src.file, 2048);
          if (scanning) {
            try {
              const { items } = await postJson<{ items: ScannedItem[] }>("/api/scan-closet", {
                photo: await blobToDataUrl(await normalizePhoto(full, 1280)),
              });
              if (!items.length) {
                setSource(src.key, { status: "empty", full, note: "No headshot clothing spotted" });
                continue;
              }
              addCards(await cardsFromScan(src.key, full, items));
              setSource(src.key, { status: "done", full, note: `${items.length} piece${items.length === 1 ? "" : "s"}` });
              continue;
            } catch (err) {
              // Rate limit or scanner outage: finish the batch without AI rather than failing it.
              if (err instanceof ApiError && (err.status === 429 || err.status === 503 || err.status === 401)) {
                scanning = false;
                setNotice((n) => `${n} ${err.message} Remaining photos were added with a color guess — fix names by hand.`.trim());
              }
            }
          }
          addCards([await fallbackCard(src.key, src.file, full)]);
          setSource(src.key, { status: "fallback", full, note: scanner ? "Added without AI" : "Added" });
        } catch (err) {
          setSource(src.key, { status: "error", note: (err as Error).message || "Couldn't read this photo" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  };

  const keepEmpty = async (src: Source) => {
    if (!src.full) return;
    addCards([await fallbackCard(src.key, src.file, src.full)]);
    setSource(src.key, { status: "fallback", note: "Added anyway" });
  };

  const save = async () => {
    const sourceIds = new Map<string, string>();
    const items: ClosetItem[] = [];
    for (const c of chosen) {
      const photoId = uid("img");
      await db.putBlob(photoId, c.photo);
      let sourcePhotoId: string | undefined;
      if (c.fromGroup) {
        sourcePhotoId = sourceIds.get(c.sourceKey);
        const full = sources.find((s) => s.key === c.sourceKey)?.full;
        if (!sourcePhotoId && full) {
          sourcePhotoId = uid("img");
          await db.putBlob(sourcePhotoId, full);
          sourceIds.set(c.sourceKey, sourcePhotoId);
        }
      }
      items.push({
        id: uid("item"),
        name: c.name.trim() || defaultItemName(c.colorName, c.category),
        category: c.category,
        colorName: c.colorName,
        colorHex: c.colorHex,
        description: c.description,
        location: c.fromGroup ? c.location : undefined,
        photoId,
        sourcePhotoId,
        createdAt: Date.now(),
      });
    }
    update((p) => ({ ...p, closet: [...p.closet, ...items] }));
    toast(`Added ${items.length} item${items.length === 1 ? "" : "s"} to the wardrobe.`, "success");
    onClose();
  };

  const editCard = (key: string, patch: Partial<Card>) => setCards((all) => all.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  return (
    <Modal
      title="Import wardrobe photos"
      wide={stage === "working"}
      onClose={() => {
        stopRef.current = true;
        onClose();
      }}
      footer={
        stage === "working" ? (
          <>
            <span className="small muted grow">
              {running ? (
                <span className="row" style={{ gap: 8 }}>
                  <Spinner /> Reading photo {Math.min(done + 1, sources.length)} of {sources.length}…
                </span>
              ) : (
                `${cards.length} piece${cards.length === 1 ? "" : "s"} found in ${sources.length} photo${sources.length === 1 ? "" : "s"}. Uncheck anything you don't want.`
              )}
            </span>
            {running && (
              <button className="btn btn-ghost" onClick={() => (stopRef.current = true)}>
                Stop
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={running || !chosen.length}>
              Add {chosen.length} to wardrobe
            </button>
          </>
        ) : undefined
      }
    >
      {stage === "pick" && (
        <>
          <p className="muted">
            {scanner
              ? "Pick a whole album, a folder or a .zip. Our AI stylist reads every photo and fills in a card for each piece — even when one photo shows a whole rack."
              : "Pick a whole album, a folder or a .zip. Each photo becomes a wardrobe card with a color guess you can rename."}
          </p>
          {notice && <div className="notice notice-warn small">{notice}</div>}
          <div
            className={`drop ${over ? "drop-over" : ""}`}
            style={{ padding: "30px 16px" }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setOver(false);
              start(await filesFromDrop(e.dataTransfer));
            }}
          >
            <Icon name="upload" size={26} />
            <span className="drop-label">Drop photos, a folder or a .zip here</span>
            <span className="drop-hint">JPG, PNG, WebP or iPhone HEIC · up to {MAX_IMPORT} photos at a time</span>
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => photoInput.current?.click()}>
              <Icon name="camera" size={16} /> Choose photos
            </button>
            <button className="btn" onClick={() => folderInput.current?.click()}>
              <Icon name="board" size={16} /> Choose a folder
            </button>
            <button className="btn" onClick={() => zipInput.current?.click()}>
              <Icon name="download" size={16} /> Choose a .zip
            </button>
          </div>
          <p className="tiny muted" style={{ textAlign: "center" }}>
            On a phone, &ldquo;Choose photos&rdquo; opens your photo library — select as many as you like.
          </p>
          <FileInput inputRef={photoInput} accept="image/*,.heic,.heif" onFiles={start} />
          <FileInput inputRef={folderInput} folder onFiles={start} />
          <FileInput inputRef={zipInput} accept=".zip,application/zip" onFiles={start} />
        </>
      )}

      {stage === "working" && (
        <>
          {notice && <div className="notice notice-warn small">{notice}</div>}
          <div className="import-progress" aria-label="Photos">
            {sources.map((s) => (
              <div key={s.key} className={`import-source is-${s.status}`} title={`${s.file.name}${s.note ? ` — ${s.note}` : ""}`}>
                <SourceThumb source={s} />
                <span className="import-state">
                  {s.status === "working" || s.status === "queued" ? (
                    <Spinner />
                  ) : s.status === "error" ? (
                    <Icon name="x" size={12} />
                  ) : s.status === "empty" ? (
                    "–"
                  ) : (
                    <Icon name="check" size={12} />
                  )}
                </span>
                {s.status === "empty" && (
                  <button className="import-keep" onClick={() => keepEmpty(s)}>
                    Add anyway
                  </button>
                )}
              </div>
            ))}
          </div>

          {cards.length > 0 && (
            <div className="scan-grid import-cards">
              {cards.map((c) => (
                <div key={c.key} className={`scan-item ${c.on ? "on" : ""}`}>
                  <button className="item-thumb" style={{ border: 0, padding: 0, cursor: "pointer", width: "100%" }} onClick={() => editCard(c.key, { on: !c.on })} aria-pressed={c.on} aria-label={`Include ${c.name || "item"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt={c.name} />
                    <span className="import-check">{c.on && <Icon name="check" size={14} />}</span>
                    {c.ai && <span className="import-ai">AI</span>}
                  </button>
                  <div className="item-body" style={{ gap: 6 }}>
                    <input className="input import-name" value={c.name} placeholder="Name this piece" onChange={(e) => editCard(c.key, { name: e.target.value })} maxLength={60} />
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <Swatch hex={c.colorHex} label={c.colorName} size={16} />
                      <select className="select import-cat" value={c.category} onChange={(e) => editCard(c.key, { category: e.target.value as ItemCategory })}>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function FileInput({
  inputRef,
  accept,
  folder,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  folder?: boolean;
  onFiles: (files: File[]) => void;
}) {
  // webkitdirectory isn't in React's types; it's supported by every current desktop browser.
  const folderProps = folder ? ({ webkitdirectory: "", directory: "" } as Record<string, string>) : {};
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={accept}
      hidden
      {...folderProps}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
}

function SourceThumb({ source }: { source: Source }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!source.full) return;
    const u = URL.createObjectURL(source.full);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [source.full]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" /> : <span className="img-placeholder" />;
}

async function cardsFromScan(sourceKey: string, full: Blob, items: ScannedItem[]): Promise<Card[]> {
  const single = items.length === 1;
  const out: Card[] = [];
  for (const it of items) {
    // One piece in the photo: keep the whole photo. Several: cut each one out.
    const photo = single ? await normalizePhoto(full, 1024) : await cropPhoto(full, it.box);
    out.push({
      key: uid("card"),
      sourceKey,
      name: it.name,
      category: it.category,
      colorName: it.colorName,
      colorHex: it.colorHex,
      description: it.description,
      location: it.location,
      photo,
      url: URL.createObjectURL(photo),
      fromGroup: !single,
      ai: true,
      on: true,
    });
  }
  return out;
}

async function fallbackCard(sourceKey: string, file: File, full: Blob): Promise<Card> {
  const photo = await normalizePhoto(full, 1024);
  const color = await guessColor(photo);
  return {
    key: uid("card"),
    sourceKey,
    name: nameFromFile(file.name),
    category: categoryFromName(file.name),
    colorName: color.name,
    colorHex: color.hex,
    description: "",
    location: "",
    photo,
    url: URL.createObjectURL(photo),
    fromGroup: false,
    ai: false,
    on: true,
  };
}
