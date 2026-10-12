"use client";

import { useState } from "react";
import { useStore } from "./store";
import { BlobImage, Icon, Modal, PhotoDrop, Spinner, Swatch, confirmAction } from "./ui";
import { COLOR_SWATCHES } from "@/lib/presets";
import { CATEGORY_LABELS, type ClosetItem, type ItemCategory, type ScannedItem } from "@/lib/types";
import { db, removeBlobs } from "@/lib/client/db";
import { blobToDataUrl, cropPhoto, normalizePhoto } from "@/lib/client/images";
import { postJson } from "@/lib/client/api";
import { uid } from "@/lib/client/id";

export function WardrobeTab({ onNext }: { onNext: () => void }) {
  const { project, update, config, toast } = useStore();
  const [editing, setEditing] = useState<ClosetItem | "new" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<ItemCategory | "all">("all");
  if (!project) return null;
  const items = project.closet.filter((c) => filter === "all" || c.category === filter);
  const usedCats = Array.from(new Set(project.closet.map((c) => c.category)));

  const remove = async (item: ClosetItem) => {
    if (!confirmAction(`Remove "${item.name}" from the wardrobe?`)) return;
    update((p) => ({
      ...p,
      closet: p.closet.filter((c) => c.id !== item.id),
      looks: p.looks.map((l) => ({ ...l, layers: l.layers.map((s) => (s.itemId === item.id ? { ...s, itemId: undefined } : s)) })),
    }));
    const stillUsed = project.closet.some((c) => c.id !== item.id && c.sourcePhotoId && c.sourcePhotoId === item.sourcePhotoId);
    await removeBlobs([item.photoId, stillUsed ? undefined : item.sourcePhotoId].filter((x): x is string => Boolean(x)));
    toast("Removed from wardrobe.");
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="eyebrow">Step 2</span>
          <h1>Wardrobe inventory</h1>
          <p>
            Snap the clothes you already own — one at a time, or the whole rack at once — or just describe them. Everything here can be hung on the rail in the Studio.
          </p>
        </div>
        <div className="row">
          {config?.scannerEnabled && (
            <button className="btn" onClick={() => setScanning(true)}>
              <Icon name="scan" /> Scan a rack photo
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" /> Add an item
          </button>
        </div>
      </div>

      {project.closet.length > 0 && usedCats.length > 1 && (
        <div className="chips">
          <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
            All ({project.closet.length})
          </button>
          {usedCats.map((c) => (
            <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {project.closet.length === 0 ? (
        <div className="empty">
          <Icon name="hanger" size={34} />
          <h3>Your rail is empty</h3>
          <p className="muted small" style={{ maxWidth: 460, margin: "0 auto 16px" }}>
            Lay clothes out on a bed or hang them on a door and take one photo
            {config?.scannerEnabled ? " — we'll find each piece for you" : ""}. You can also skip this and describe outfits directly in the Studio.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            {config?.scannerEnabled && (
              <button className="btn" onClick={() => setScanning(true)}>
                <Icon name="scan" /> Scan a rack photo
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <Icon name="plus" /> Add an item
            </button>
            <button className="btn btn-ghost" onClick={onNext}>
              Skip to Studio →
            </button>
          </div>
        </div>
      ) : (
        <div className="inventory">
          {items.map((item) => (
            <div className="item-card" key={item.id}>
              <div className="item-thumb">
                {item.photoId || item.sourcePhotoId ? (
                  <BlobImage id={item.photoId ?? item.sourcePhotoId} alt={item.name} />
                ) : (
                  <div className="color-fill" style={{ background: item.colorHex }}>
                    <Icon name="hanger" size={40} />
                  </div>
                )}
              </div>
              <div className="item-body">
                <span className="cat-tag">{CATEGORY_LABELS[item.category]}</span>
                <b>{item.name}</b>
                <span className="row tiny muted" style={{ gap: 6 }}>
                  <Swatch hex={item.colorHex} label={item.colorName} size={14} /> {item.colorName}
                </span>
                <div className="row" style={{ marginTop: "auto", gap: 2 }}>
                  <button className="icon-btn" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => remove(item)} aria-label={`Remove ${item.name}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button className="drop" onClick={() => setEditing("new")} style={{ minHeight: 220 }}>
            <Icon name="plus" />
            <span className="drop-label">Add an item</span>
          </button>
        </div>
      )}

      {project.closet.length > 0 && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onNext}>
            Next: build looks →
          </button>
        </div>
      )}

      {editing && <ItemEditor item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {scanning && <ScanDialog onClose={() => setScanning(false)} />}
    </div>
  );
}

export function ItemEditor({
  item,
  onClose,
  onSaved,
  defaults,
}: {
  item: ClosetItem | null;
  onClose: () => void;
  onSaved?: (item: ClosetItem) => void;
  defaults?: Partial<ClosetItem>;
}) {
  const { update, toast } = useStore();
  const [draft, setDraft] = useState<ClosetItem>(
    item ?? {
      id: uid("item"),
      name: "",
      category: "top",
      colorName: "",
      colorHex: "#9aa0a6",
      description: "",
      createdAt: Date.now(),
      ...defaults,
    },
  );
  const [busy, setBusy] = useState(false);

  const setPhoto = async (files: File[]) => {
    setBusy(true);
    try {
      const blob = await normalizePhoto(files[0], 1024);
      const id = uid("img");
      await db.putBlob(id, blob);
      setDraft((d) => ({ ...d, photoId: id, useSourcePhoto: false }));
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const saved = { ...draft, name: draft.name.trim() || `${draft.colorName} ${CATEGORY_LABELS[draft.category]}`.trim() };
    update((p) => ({
      ...p,
      closet: p.closet.some((c) => c.id === saved.id) ? p.closet.map((c) => (c.id === saved.id ? saved : c)) : [...p.closet, saved],
      // Keep any look slots that use this item in sync with its name/color.
      looks: p.looks.map((l) => ({
        ...l,
        layers: l.layers.map((s) => (s.itemId === saved.id ? { ...s, garment: saved.name, colorName: saved.colorName, colorHex: saved.colorHex } : s)),
      })),
    }));
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      title={item ? "Edit item" : "Add a wardrobe item"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!draft.name.trim() && !draft.colorName.trim()}>
            Save to wardrobe
          </button>
        </>
      }
    >
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 130, flex: "none" }} className="stack">
          <div className="item-thumb" style={{ borderRadius: 12, border: "1px solid var(--line)" }}>
            {draft.photoId || draft.sourcePhotoId ? (
              <BlobImage id={draft.useSourcePhoto ? draft.sourcePhotoId : (draft.photoId ?? draft.sourcePhotoId)} alt="Item photo" />
            ) : (
              <div className="color-fill" style={{ background: draft.colorHex }}>
                <Icon name="hanger" size={36} />
              </div>
            )}
          </div>
          <PhotoDrop onFiles={setPhoto} compact busy={busy} label={draft.photoId ? "Replace" : "Photo"} />
        </div>
        <div className="stack grow">
          <label className="field">
            <span>What is it?</span>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Ribbed henley, Denim jacket"
              maxLength={60}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ItemCategory })}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="field">
        <span>Color</span>
        <div className="swatches">
          {COLOR_SWATCHES.map((c) => (
            <Swatch key={c.hex} hex={c.hex} label={c.name} active={draft.colorHex === c.hex} onClick={() => setDraft({ ...draft, colorHex: c.hex, colorName: c.name })} />
          ))}
        </div>
        <input
          className="input"
          value={draft.colorName}
          onChange={(e) => setDraft({ ...draft, colorName: e.target.value })}
          placeholder="Color name, e.g. dusty rose"
          maxLength={40}
        />
      </div>
      <label className="field">
        <span>Details (fabric, neckline, pattern)</span>
        <textarea
          className="textarea"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="e.g. ribbed cotton, three-button placket, slightly cropped"
          maxLength={300}
        />
      </label>
      {draft.sourcePhotoId && draft.photoId && (
        <label className="check small">
          <input type="checkbox" checked={Boolean(draft.useSourcePhoto)} onChange={(e) => setDraft({ ...draft, useSourcePhoto: e.target.checked })} />
          <span>Send the whole rack photo instead of the crop (use if the crop cut off part of the item)</span>
        </label>
      )}
    </Modal>
  );
}

interface ScanRow extends ScannedItem {
  key: string;
  cropUrl: string;
  cropBlob: Blob;
  on: boolean;
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const { update, toast } = useStore();
  const [stage, setStage] = useState<"pick" | "scanning" | "review">("pick");
  const [source, setSource] = useState<Blob | null>(null);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [error, setError] = useState("");

  const scan = async (files: File[]) => {
    setError("");
    setStage("scanning");
    try {
      const full = await normalizePhoto(files[0], 2048);
      setSource(full);
      const { items } = await postJson<{ items: ScannedItem[] }>("/api/scan-closet", {
        photo: await blobToDataUrl(await normalizePhoto(full, 1536)),
      });
      if (!items.length) throw new Error("We couldn't spot any clothing in that photo. Try a brighter, closer shot.");
      const next: ScanRow[] = [];
      for (const it of items) {
        const cropBlob = await cropPhoto(full, it.box);
        next.push({ ...it, key: uid(), cropBlob, cropUrl: URL.createObjectURL(cropBlob), on: true });
      }
      setRows(next);
      setStage("review");
    } catch (err) {
      setError((err as Error).message);
      setStage("pick");
    }
  };

  const save = async () => {
    if (!source) return;
    const chosen = rows.filter((r) => r.on);
    const sourceId = uid("img");
    await db.putBlob(sourceId, source);
    const items: ClosetItem[] = [];
    for (const r of chosen) {
      const photoId = uid("img");
      await db.putBlob(photoId, r.cropBlob);
      items.push({
        id: uid("item"),
        name: r.name,
        category: r.category,
        colorName: r.colorName,
        colorHex: r.colorHex,
        description: r.description,
        location: r.location,
        photoId,
        sourcePhotoId: sourceId,
        createdAt: Date.now(),
      });
    }
    update((p) => ({ ...p, closet: [...p.closet, ...items] }));
    rows.forEach((r) => URL.revokeObjectURL(r.cropUrl));
    toast(`Added ${items.length} item${items.length === 1 ? "" : "s"} to the wardrobe.`, "success");
    onClose();
  };

  return (
    <Modal
      title="Scan a rack photo"
      wide={stage === "review"}
      onClose={onClose}
      footer={
        stage === "review" ? (
          <>
            <span className="small muted grow">Uncheck anything you don&apos;t want. You can fix names and colors later.</span>
            <button className="btn btn-primary" onClick={save} disabled={!rows.some((r) => r.on)}>
              Add {rows.filter((r) => r.on).length} to wardrobe
            </button>
          </>
        ) : undefined
      }
    >
      {stage === "pick" && (
        <>
          <p className="muted">
            Hang or lay out the options for the shoot and take one well-lit photo. Our AI stylist will find each top, layer and accessory.
          </p>
          {error && <div className="notice notice-error">{error}</div>}
          <PhotoDrop onFiles={scan} label="Choose the rack photo" hint="JPG, PNG or iPhone HEIC" />
        </>
      )}
      {stage === "scanning" && (
        <div className="stack" style={{ alignItems: "center", padding: 30 }}>
          <Spinner />
          <b>Finding each piece…</b>
          <span className="small muted">This takes about 20–40 seconds.</span>
        </div>
      )}
      {stage === "review" && (
        <div className="scan-grid">
          {rows.map((r) => (
            <button key={r.key} className={`scan-item ${r.on ? "on" : ""}`} onClick={() => setRows(rows.map((x) => (x.key === r.key ? { ...x, on: !x.on } : x)))}>
              <div className="item-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.cropUrl} alt={r.name} />
              </div>
              <div className="item-body">
                <span className="row" style={{ gap: 6 }}>
                  <input type="checkbox" readOnly checked={r.on} tabIndex={-1} />
                  <Swatch hex={r.colorHex} label={r.colorName} size={14} />
                  <b style={{ fontSize: 13 }}>{r.name}</b>
                </span>
                <span className="tiny muted">{CATEGORY_LABELS[r.category]}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
