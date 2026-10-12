"use client";

import { useState } from "react";
import { useStore } from "./store";
import { BlobImage, Icon, Modal, PhotoDrop, Swatch, confirmAction } from "./ui";
import { ImportDialog } from "./ImportDialog";
import { COLOR_SWATCHES } from "@/lib/presets";
import { CATEGORY_LABELS, type ClosetItem, type ItemCategory } from "@/lib/types";
import { db, removeBlobs } from "@/lib/client/db";
import { normalizePhoto } from "@/lib/client/images";
import { uid } from "@/lib/client/id";

export function WardrobeTab({ onNext }: { onNext: () => void }) {
  const { project, update, config, toast } = useStore();
  const [editing, setEditing] = useState<ClosetItem | "new" | null>(null);
  const [importing, setImporting] = useState(false);
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
            Import photos of the clothes you already own — an album, a folder or a .zip — or just describe them. Everything here can be hung on the rail in the Studio.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing("new")}>
            <Icon name="plus" /> Add one item
          </button>
          <button className="btn btn-primary" onClick={() => setImporting(true)}>
            <Icon name="upload" /> Import photos
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
            Import a whole album, folder or .zip of clothing photos
            {config?.scannerEnabled ? " — we'll fill in a card for every piece, even from a photo of the whole rack" : ""}. You can also skip this and describe outfits directly in the Studio.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-hot" onClick={() => setImporting(true)}>
              <Icon name="upload" /> Import photos
            </button>
            <button className="btn" onClick={() => setEditing("new")}>
              <Icon name="plus" /> Add one item
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
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
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
