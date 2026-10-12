"use client";

import { useState } from "react";
import { useStore } from "./store";
import { BlobImage, Icon, PhotoDrop } from "./ui";
import { DangerZone } from "./App";
import { CASTING_TYPES } from "@/lib/presets";
import { AGE_RANGES, type CastingType } from "@/lib/types";
import { db, removeBlobs } from "@/lib/client/db";
import { normalizePhoto } from "@/lib/client/images";
import { uid } from "@/lib/client/id";

export function ProfileTab({ onNext }: { onNext: () => void }) {
  const { project, update, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ title: "", wardrobe: "" });
  if (!project) return null;
  const { actor } = project;
  const types = [...CASTING_TYPES, ...project.customCastingTypes];

  const addPhotos = async (files: File[]) => {
    const room = 3 - actor.photoIds.length;
    if (room <= 0) return toast("Three reference photos is plenty — remove one to add another.");
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const f of files.slice(0, room)) {
        const blob = await normalizePhoto(f, 1600);
        const id = uid("img");
        await db.putBlob(id, blob);
        ids.push(id);
      }
      update((p) => ({ ...p, actor: { ...p.actor, photoIds: [...p.actor.photoIds, ...ids] } }));
    } catch (err) {
      toast((err as Error).message || "Couldn't read that photo.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleType = (key: string) =>
    update((p) => ({
      ...p,
      actor: {
        ...p.actor,
        castingTypes: p.actor.castingTypes.includes(key)
          ? p.actor.castingTypes.filter((k) => k !== key)
          : [...p.actor.castingTypes, key],
      },
    }));

  const addCustom = () => {
    if (!custom.title.trim()) return;
    const t: CastingType = {
      key: uid("ct"),
      title: custom.title.trim(),
      blurb: "Your own casting type.",
      wardrobe: custom.wardrobe.trim() || "Wardrobe that helps tell this character's story.",
      expression: "keep the same expression as the reference photo",
      backdrop: { colorName: "medium gray", colorHex: "#9aa0a6", style: "seamless studio backdrop" },
      ideas: {},
      palette: [],
      custom: true,
    };
    update((p) => ({
      ...p,
      customCastingTypes: [...p.customCastingTypes, t],
      actor: { ...p.actor, castingTypes: [...p.actor.castingTypes, t.key] },
    }));
    setCustom({ title: "", wardrobe: "" });
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="eyebrow">Step 1</span>
          <h1>{actor.name ? `${actor.name}'s profile` : "Actor profile"}</h1>
          <p>The photo you add here is the identity reference for every preview — Try A Look keeps their real face, hair, skin tone and age.</p>
        </div>
        <button className="btn btn-primary" onClick={onNext} disabled={!actor.photoIds.length}>
          Next: wardrobe →
        </button>
      </div>

      <div className="profile-grid">
        <div className="stack">
          <div className="card stack">
            <label className="field">
              <span>First name or nickname</span>
              <input
                className="input"
                value={actor.name}
                onChange={(e) => update((p) => ({ ...p, actor: { ...p.actor, name: e.target.value } }))}
                placeholder="e.g. Chloe"
                maxLength={40}
              />
            </label>
            <label className="field">
              <span>Approximate age range</span>
              <select
                className="select"
                value={actor.ageRange}
                onChange={(e) => update((p) => ({ ...p, actor: { ...p.actor, ageRange: e.target.value } }))}
              >
                <option value="">Choose…</option>
                {AGE_RANGES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>

            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Reference photos ({actor.photoIds.length}/3)</span>
              {actor.photoIds.length > 0 && (
                <div className="actor-photos">
                  {actor.photoIds.map((id, i) => (
                    <div className="actor-photo" key={id}>
                      <BlobImage id={id} alt={`Reference photo ${i + 1}`} />
                      {i === 0 && <span className="primary-tag">Main</span>}
                      <button
                        className="icon-btn"
                        aria-label="Remove photo"
                        onClick={async () => {
                          update((p) => ({ ...p, actor: { ...p.actor, photoIds: p.actor.photoIds.filter((x) => x !== id) } }));
                          await removeBlobs([id]);
                        }}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {actor.photoIds.length < 3 && (
                <PhotoDrop
                  onFiles={addPhotos}
                  multiple
                  busy={busy}
                  label={actor.photoIds.length ? "Add another angle" : "Add a photo of the actor"}
                  hint="Best: facing the camera, good light, shoulders visible, a simple top. A recent phone photo is fine."
                />
              )}
            </div>

            <label className="field">
              <span>Anything we should keep exactly? (optional)</span>
              <textarea
                className="textarea"
                value={actor.notes}
                onChange={(e) => update((p) => ({ ...p, actor: { ...p.actor, notes: e.target.value } }))}
                placeholder="e.g. tight natural curls, freckles, gap-tooth smile"
                maxLength={300}
              />
              <span className="tiny muted">Stays in this browser. Don&apos;t include last names, schools or other personal details.</span>
            </label>
          </div>
          <DangerZone />
        </div>

        <div className="stack">
          <div className="row-between">
            <div>
              <h2>Casting types</h2>
              <p className="muted small">
                Pick the kinds of roles you want this session to cover. These describe the role, not the kid — any actor can play any type.
              </p>
            </div>
            <span className="small muted">{actor.castingTypes.length} selected</span>
          </div>
          <div className="type-grid">
            {types.map((t) => {
              const on = actor.castingTypes.includes(t.key);
              return (
                <button key={t.key} className={`type-card ${on ? "on" : ""}`} onClick={() => toggleType(t.key)} aria-pressed={on}>
                  <span className="tick">{on && <Icon name="check" size={14} />}</span>
                  <h4>{t.title}</h4>
                  <span className="small muted">{t.blurb}</span>
                  <span className="wardrobe">
                    <b>Wardrobe:</b> {t.wardrobe}
                  </span>
                  {t.palette.length > 0 && (
                    <span className="palette">
                      {t.palette.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="card card-tight stack">
            <span className="label">Add your own casting type</span>
            <div className="row">
              <input
                className="input grow"
                placeholder="e.g. Theater kid, Farm kid, Sci-fi hero"
                value={custom.title}
                onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                maxLength={40}
              />
            </div>
            <input
              className="input"
              placeholder="Wardrobe notes (optional), e.g. vintage cardigan, earth tones"
              value={custom.wardrobe}
              onChange={(e) => setCustom({ ...custom, wardrobe: e.target.value })}
              maxLength={160}
            />
            <div>
              <button className="btn btn-sm" onClick={addCustom} disabled={!custom.title.trim()}>
                <Icon name="plus" size={16} /> Add type
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
