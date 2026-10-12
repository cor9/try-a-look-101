"use client";

import { useState } from "react";
import { useStore } from "./store";
import { AiBadge, BlobImage, Icon, Modal, confirmAction } from "./ui";
import { allCastingTypes, findCastingType } from "@/lib/presets";
import { lookSummary } from "@/lib/client/factory";
import { removeBlobs } from "@/lib/client/db";
import type { Look } from "@/lib/types";

export function BoardTab({ onOpenLook }: { onOpenLook: () => void }) {
  const { project, update, toast } = useStore();
  const [filter, setFilter] = useState<"all" | "favorites" | string>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  if (!project) return null;

  const types = allCastingTypes(project.customCastingTypes);
  const usedTypes = types.filter((t) => project.looks.some((l) => l.castingType === t.key));
  const looks = project.looks.filter((l) => (filter === "all" ? true : filter === "favorites" ? l.favorite : l.castingType === filter));
  const setLook = (id: string, fn: (l: Look) => Look) => update((p) => ({ ...p, looks: p.looks.map((l) => (l.id === id ? fn(l) : l)) }));
  const togglePick = (id: string) => setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : ps.length >= 4 ? ps : [...ps, id]));
  const inPlan = (id: string) => project.plan.lookIds.includes(id);

  const open = (id: string) => {
    try {
      sessionStorage.setItem(`tryalook.look.${project.id}`, id);
    } catch {
      /* ignore */
    }
    onOpenLook();
  };

  const remove = async (look: Look) => {
    if (!confirmAction(`Delete "${look.title}" and all its previews?`)) return;
    update((p) => ({ ...p, looks: p.looks.filter((l) => l.id !== look.id), plan: { ...p.plan, lookIds: p.plan.lookIds.filter((x) => x !== look.id) } }));
    setPicked((ps) => ps.filter((x) => x !== look.id));
    await removeBlobs(look.renders.map((r) => r.imageId));
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="eyebrow">Step 4</span>
          <h1>Look board</h1>
          <p>Star your favorites, compare side by side, and send the winners to the session plan.</p>
        </div>
        <div className="row">
          <button className="btn" disabled={picked.length < 2} onClick={() => setComparing(true)}>
            <Icon name="compare" /> Compare {picked.length >= 2 ? picked.length : ""}
          </button>
        </div>
      </div>

      {project.looks.length === 0 ? (
        <div className="empty">
          <Icon name="board" size={34} />
          <h3>No looks yet</h3>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Build a look in the Studio and it shows up here.
          </p>
          <button className="btn btn-primary" onClick={onOpenLook}>
            Go to Studio
          </button>
        </div>
      ) : (
        <>
          <div className="row-between">
            <div className="chips">
              <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
                All looks
              </button>
              <button className={`chip ${filter === "favorites" ? "on" : ""}`} onClick={() => setFilter("favorites")}>
                ★ Favorites
              </button>
              {usedTypes.map((t) => (
                <button key={t.key} className={`chip ${filter === t.key ? "on" : ""}`} onClick={() => setFilter(t.key)}>
                  {t.title}
                </button>
              ))}
            </div>
            <span className="small muted">Tick up to 4 looks to compare</span>
          </div>
          <div className="board">
            {looks.map((l, i) => {
              const r = l.renders.find((x) => x.id === l.selectedRenderId) ?? l.renders[l.renders.length - 1];
              const type = findCastingType(l.castingType, project.customCastingTypes);
              return (
                <article key={l.id} className={`board-card ${picked.includes(l.id) ? "selected" : ""}`}>
                  <div className="board-photo">
                    {r ? (
                      <>
                        <button onClick={() => open(l.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", height: "100%" }} aria-label={`Open ${l.title} in Studio`}>
                          <BlobImage id={r.imageId} alt={`AI wardrobe preview: ${l.title}`} />
                        </button>
                        <AiBadge small />
                      </>
                    ) : (
                      <div className="mirror-empty">
                        <button className="btn btn-sm" onClick={() => open(l.id)}>
                          Preview in Studio
                        </button>
                      </div>
                    )}
                    <label className="pick row" style={{ background: "rgba(255,255,255,0.92)", borderRadius: 99, padding: "3px 8px", gap: 4, fontSize: 12 }}>
                      <input type="checkbox" checked={picked.includes(l.id)} onChange={() => togglePick(l.id)} disabled={!r} /> Compare
                    </label>
                    <button className={`icon-btn fav ${l.favorite ? "on" : ""}`} onClick={() => setLook(l.id, (x) => ({ ...x, favorite: !x.favorite }))} aria-label="Favorite" aria-pressed={l.favorite}>
                      <Icon name="star" />
                    </button>
                  </div>
                  <div className="board-label">
                    <span style={{ opacity: 0.7 }}>{i + 1}.</span>
                    <input value={l.title} onChange={(e) => setLook(l.id, (x) => ({ ...x, title: e.target.value }))} aria-label="Rename look" maxLength={60} />
                  </div>
                  <div className="board-body">
                    <span className="small">{lookSummary(l)}</span>
                    <select className="select" value={l.castingType} onChange={(e) => setLook(l.id, (x) => ({ ...x, castingType: e.target.value }))} aria-label="Casting type">
                      {types.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    {type && <span className="tiny muted">{type.blurb}</span>}
                    <div className="row" style={{ marginTop: "auto", gap: 4 }}>
                      <button
                        className={`btn btn-sm ${inPlan(l.id) ? "" : "btn-primary"}`}
                        onClick={() => {
                          update((p) => ({
                            ...p,
                            plan: { ...p.plan, lookIds: inPlan(l.id) ? p.plan.lookIds.filter((x) => x !== l.id) : [...p.plan.lookIds, l.id] },
                          }));
                          toast(inPlan(l.id) ? "Removed from session plan." : "Added to session plan.", "success");
                        }}
                      >
                        {inPlan(l.id) ? <><Icon name="check" size={14} /> In plan</> : "Add to plan"}
                      </button>
                      <span className="grow" />
                      <button className="icon-btn" onClick={() => open(l.id)} aria-label="Edit in Studio">
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="icon-btn" onClick={() => remove(l)} aria-label="Delete look">
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {looks.length === 0 && <p className="muted">Nothing matches that filter yet.</p>}
        </>
      )}

      {comparing && (
        <Modal title="Side by side" wide onClose={() => setComparing(false)}>
          <div className="compare" style={{ ["--n" as string]: picked.length }}>
            {picked.map((id) => {
              const l = project.looks.find((x) => x.id === id);
              if (!l) return null;
              const r = l.renders.find((x) => x.id === l.selectedRenderId) ?? l.renders[l.renders.length - 1];
              return (
                <figure key={id}>
                  <div className="board-photo">
                    {r && <BlobImage id={r.imageId} alt={l.title} />}
                    <AiBadge small />
                    <button className={`icon-btn fav ${l.favorite ? "on" : ""}`} onClick={() => setLook(l.id, (x) => ({ ...x, favorite: !x.favorite }))} aria-label="Favorite">
                      <Icon name="star" />
                    </button>
                  </div>
                  <figcaption>
                    <b>{l.title}</b>
                    <div className="muted">{lookSummary(l)}</div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
