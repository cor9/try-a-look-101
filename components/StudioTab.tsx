"use client";

import { useEffect, useState } from "react";
import { useStore, type Job } from "./store";
import { AiBadge, BlobImage, Icon, Modal, Spinner, Swatch, confirmAction, useElapsed } from "./ui";
import { ItemEditor } from "./WardrobeTab";
import {
  BACKDROP_STYLES,
  BACKDROP_SWATCHES,
  COLOR_SWATCHES,
  EXPRESSION_OPTIONS,
  FABRICS,
  FITS,
  NECKLINES,
  QUICK_EDITS,
  allCastingTypes,
  findCastingType,
} from "@/lib/presets";
import { describeGarment } from "@/lib/prompt";
import {
  CATEGORY_LABELS,
  FRAMING_LABELS,
  ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
  defaultRoleFor,
  type ClosetItem,
  type Framing,
  type LayerRole,
  type LayerSlot,
  type Look,
  type Project,
} from "@/lib/types";
import { emptySlot, newLook, slotFromItem } from "@/lib/client/factory";
import { db, removeBlobs } from "@/lib/client/db";
import { downloadBlob, stampSimulation } from "@/lib/client/images";

/** Bring the preview into view after kicking off a generation or edit. */
function showMirror() {
  document.querySelector(".mirror")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const ROLE_ADD: Record<LayerRole, string> = {
  base: "a base layer",
  second: "a second layer",
  outer: "outerwear",
  accessory: "an accessory",
};

const ROLE_COLORS: Record<LayerRole, string> = {
  base: "var(--blue)",
  second: "var(--teal)",
  outer: "var(--red)",
  accessory: "var(--orange)",
};

export function StudioTab() {
  const { project, update } = useStore();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!project) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(`tryalook.look.${project.id}`);
    } catch {
      /* ignore */
    }
    setCurrentId((cur) => (cur && project.looks.some((l) => l.id === cur) ? cur : saved && project.looks.some((l) => l.id === saved) ? saved : project.looks[0]?.id ?? null));
  }, [project]);

  if (!project) return null;
  const look = project.looks.find((l) => l.id === currentId) ?? null;

  const select = (id: string) => {
    setCurrentId(id);
    try {
      sessionStorage.setItem(`tryalook.look.${project.id}`, id);
    } catch {
      /* ignore */
    }
  };

  const create = (typeKey: string) => {
    const l = newLook(typeKey, project.customCastingTypes, project.looks);
    update((p) => ({ ...p, looks: [...p.looks, l] }));
    select(l.id);
    setPicking(false);
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="eyebrow">Step 3</span>
          <h1>Studio</h1>
          <p>Hang pieces on the rail from the inside out, then preview. Don&apos;t love something? Tell it what to change — no need to start over.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setPicking(true)}>
          <Icon name="plus" /> New look
        </button>
      </div>

      {!look ? (
        <div className="empty">
          <Icon name="hanger" size={34} />
          <h3>Start your first look</h3>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Each look is one outfit aimed at a casting type — like &ldquo;Girl Next Door: blue henley + denim jacket.&rdquo;
          </p>
          <button className="btn btn-hot" onClick={() => setPicking(true)}>
            Choose a casting type
          </button>
        </div>
      ) : (
        <div className="studio">
          <LookList project={project} currentId={look.id} onSelect={select} onNew={() => setPicking(true)} />
          <Mirror project={project} look={look} />
          <RailColumn project={project} look={look} />
        </div>
      )}

      {picking && <CastingPicker project={project} onPick={create} onClose={() => setPicking(false)} />}
    </div>
  );
}

function CastingPicker({ project, onPick, onClose }: { project: Project; onPick: (key: string) => void; onClose: () => void }) {
  const types = allCastingTypes(project.customCastingTypes);
  const chosen = types.filter((t) => project.actor.castingTypes.includes(t.key));
  const rest = types.filter((t) => !project.actor.castingTypes.includes(t.key));
  const Card = ({ t }: { t: (typeof types)[number] }) => (
    <button className="type-card" onClick={() => onPick(t.key)}>
      <h4>{t.title}</h4>
      <span className="wardrobe">{t.wardrobe}</span>
      {t.palette.length > 0 && (
        <span className="palette">
          {t.palette.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      )}
    </button>
  );
  return (
    <Modal title="What's this look for?" onClose={onClose} wide>
      {chosen.length > 0 && (
        <>
          <span className="eyebrow">Your casting types</span>
          <div className="type-grid">{chosen.map((t) => <Card key={t.key} t={t} />)}</div>
          <span className="eyebrow">More types</span>
        </>
      )}
      <div className="type-grid">{rest.map((t) => <Card key={t.key} t={t} />)}</div>
    </Modal>
  );
}

function LookList({ project, currentId, onSelect, onNew }: { project: Project; currentId: string; onSelect: (id: string) => void; onNew: () => void }) {
  const { jobs } = useStore();
  return (
    <div className="look-list" role="tablist" aria-label="Looks">
      {project.looks.map((l) => {
        const r = l.renders.find((x) => x.id === l.selectedRenderId) ?? l.renders[l.renders.length - 1];
        const busy = jobs.some((j) => j.lookId === l.id && j.status === "running");
        return (
          <button key={l.id} className={`look-tab ${l.id === currentId ? "on" : ""}`} onClick={() => onSelect(l.id)} role="tab" aria-selected={l.id === currentId}>
            <span className="mini">{r ? <BlobImage id={r.imageId} alt="" /> : null}</span>
            <span className="grow">
              <b>{l.title}</b>
              <span className="tiny muted row" style={{ gap: 4 }}>
                {busy ? (
                  <>
                    <Spinner /> developing…
                  </>
                ) : (
                  `${l.renders.length} preview${l.renders.length === 1 ? "" : "s"}`
                )}
                {l.favorite && <span style={{ color: "var(--orange)" }}>★</span>}
              </span>
            </span>
          </button>
        );
      })}
      <button className="add-slot" onClick={onNew}>
        <Icon name="plus" size={16} /> New look
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- mirror

function Mirror({ project, look }: { project: Project; look: Look }) {
  const { jobs, update, edit, dismissJob, generate, toast } = useStore();
  const lookJobs = jobs.filter((j) => j.lookId === look.id);
  const running = lookJobs.filter((j) => j.status === "running");
  const failed = lookJobs.filter((j) => j.status === "error");
  const render = look.renders.find((r) => r.id === look.selectedRenderId) ?? look.renders[look.renders.length - 1];

  const setLook = (fn: (l: Look) => Look) => update((p) => ({ ...p, looks: p.looks.map((l) => (l.id === look.id ? fn(l) : l)) }));

  const removeRender = async () => {
    if (!render || !confirmAction("Delete this preview?")) return;
    setLook((l) => {
      const renders = l.renders.filter((r) => r.id !== render.id);
      return { ...l, renders, selectedRenderId: renders[renders.length - 1]?.id };
    });
    await removeBlobs([render.imageId]);
  };

  const download = async () => {
    if (!render) return;
    const blob = await db.getBlob(render.imageId);
    if (!blob) return;
    const stamped = await stampSimulation(blob, look.title);
    downloadBlob(stamped, `${(project.actor.name || "actor").replace(/\W+/g, "-")}-${look.title.replace(/\W+/g, "-")}.jpg`.toLowerCase());
    toast("Downloaded with the AI simulation label.");
  };

  return (
    <div className="mirror">
      <div className="mirror-frame">
        {render ? (
          <>
            <BlobImage key={render.id} id={render.imageId} alt={`AI wardrobe preview: ${render.summary}`} />
            <AiBadge />
            <div className="mirror-actions">
              <button className={`icon-btn ${look.favorite ? "on" : ""}`} onClick={() => setLook((l) => ({ ...l, favorite: !l.favorite }))} aria-label="Favorite look" aria-pressed={look.favorite}>
                <Icon name="star" />
              </button>
              <button className="icon-btn" onClick={download} aria-label="Download preview">
                <Icon name="download" />
              </button>
              <button className="icon-btn" onClick={removeRender} aria-label="Delete preview">
                <Icon name="trash" />
              </button>
            </div>
          </>
        ) : (
          <div className="mirror-empty">
            <div>
              {project.actor.photoIds[0] && (
                <div className="ref">
                  <BlobImage id={project.actor.photoIds[0]} alt="Actor reference" />
                </div>
              )}
              <b>Your preview appears here</b>
              <p className="small muted" style={{ marginTop: 4 }}>
                Hang at least a base layer on the rail, then press <b>Preview this look</b>.
              </p>
            </div>
          </div>
        )}
        {running.length > 0 && <Developing job={running[0]} />}
      </div>

      {failed.map((j) => (
        <div key={j.id} className="notice notice-error job-error">
          <div className="grow small">
            <b>{j.kind === "edit" ? "Edit" : "Preview"} didn&apos;t work.</b> {j.error}
          </div>
          {j.kind === "generate" && (
            <button
              className="btn btn-sm"
              onClick={() => {
                dismissJob(j.id);
                generate(look.id, 1);
              }}
            >
              Retry
            </button>
          )}
          <button className="icon-btn" onClick={() => dismissJob(j.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}

      {(look.renders.length > 1 || running.length > 0) && (
        <div className="versions" aria-label="Versions">
          {look.renders.map((r, i) => (
            <button key={r.id} className={`version ${r.id === render?.id ? "on" : ""}`} onClick={() => setLook((l) => ({ ...l, selectedRenderId: r.id }))} title={r.instruction ?? r.summary}>
              <BlobImage id={r.imageId} alt={`Version ${i + 1}`} />
              <span className="vtag">{r.kind === "edit" ? "✎ edit" : `v${i + 1}`}</span>
            </button>
          ))}
          {running.map((j) => (
            <div key={j.id} className="version pending" title={j.label}>
              <Spinner />
            </div>
          ))}
        </div>
      )}

      {render && <EditBar project={project} lookId={look.id} renderId={render.id} history={render.kind === "edit" ? render.instruction : undefined} onEdit={edit} busy={running.length > 0} />}
    </div>
  );
}

function Developing({ job }: { job: Job }) {
  const secs = useElapsed(job.startedAt);
  const msg = secs < 8 ? "Setting up the lights…" : secs < 25 ? "Dressing the rail…" : secs < 50 ? "Developing your preview…" : "Almost there — detailed looks take a little longer.";
  return (
    <div className="developing" role="status">
      <div className="developing-inner">
        <div className="shutter" />
        <b>{job.kind === "edit" ? "Applying your change" : msg}</b>
        <div className="small muted">{secs}s</div>
      </div>
    </div>
  );
}

function EditBar({
  project,
  lookId,
  renderId,
  history,
  onEdit,
  busy,
}: {
  project: Project;
  lookId: string;
  renderId: string;
  history?: string;
  onEdit: (lookId: string, renderId: string, instruction: string, garmentPhotoId?: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [garmentId, setGarmentId] = useState("");
  const withPhotos = project.closet.filter((c) => c.photoId || c.sourcePhotoId);
  const garment = withPhotos.find((c) => c.id === garmentId);
  const submit = (instruction: string) => {
    if (!instruction.trim()) return;
    const finalText = garment && !instruction.toLowerCase().includes(garment.name.toLowerCase()) ? `${instruction} (use the ${garment.colorName} ${garment.name} from the reference photo)` : instruction;
    onEdit(lookId, renderId, finalText.trim(), garment ? (garment.useSourcePhoto ? garment.sourcePhotoId : (garment.photoId ?? garment.sourcePhotoId)) : undefined);
    showMirror();
    setText("");
    setGarmentId("");
  };
  return (
    <div className="edit-bar">
      <div className="row-between">
        <span className="label row" style={{ gap: 6 }}>
          <Icon name="wand" size={16} /> Tweak this preview
        </span>
        <span className="tiny muted">Keeps everything else the same</span>
      </div>
      {history && <div className="edit-history">Last change: &ldquo;{history}&rdquo;</div>}
      <div className="chips">
        {QUICK_EDITS.map((q) => (
          <button key={q} className="chip" onClick={() => submit(q)} disabled={busy}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="edit-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "Change the shirt to forest green"' maxLength={300} />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          Apply
        </button>
      </form>
      {withPhotos.length > 0 && (
        <label className="row small" style={{ gap: 8 }}>
          <span className="muted">Swap in a garment from your wardrobe:</span>
          <select className="select" style={{ width: "auto", padding: "5px 8px" }} value={garmentId} onChange={(e) => setGarmentId(e.target.value)}>
            <option value="">None</option>
            {withPhotos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.colorName} {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- rail

function RailColumn({ project, look }: { project: Project; look: Look }) {
  const { update, generate, config, jobs, toast } = useStore();
  const [openSlot, setOpenSlot] = useState<string | null>(look.layers[0]?.id ?? null);
  const [variations, setVariations] = useState(1);
  const type = findCastingType(look.castingType, project.customCastingTypes);
  const types = allCastingTypes(project.customCastingTypes);
  const running = jobs.filter((j) => j.lookId === look.id && j.status === "running").length;

  // On switching looks, open the first empty slot so a fresh look is ready to dress.
  useEffect(() => {
    setOpenSlot(look.layers.find((s) => !s.garment.trim() && !s.itemId)?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.id]);

  const setLook = (fn: (l: Look) => Look) => update((p) => ({ ...p, looks: p.looks.map((l) => (l.id === look.id ? fn(l) : l)) }));
  const setSlot = (id: string, patch: Partial<LayerSlot>) => setLook((l) => ({ ...l, layers: l.layers.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const addSlot = (role: LayerRole) => {
    const s = emptySlot(role);
    setLook((l) => ({ ...l, layers: [...l.layers, s] }));
    setOpenSlot(s.id);
  };

  const hasWardrobe = look.layers.some((s) => s.garment.trim() || s.itemId);
  const canGenerate = Boolean(config?.imageProvider) && project.actor.photoIds.length > 0 && hasWardrobe;

  const deleteLook = async () => {
    if (!confirmAction(`Delete "${look.title}" and its ${look.renders.length} preview(s)?`)) return;
    update((p) => ({
      ...p,
      looks: p.looks.filter((l) => l.id !== look.id),
      plan: { ...p.plan, lookIds: p.plan.lookIds.filter((id) => id !== look.id) },
    }));
    await removeBlobs(look.renders.map((r) => r.imageId));
    toast("Look deleted.");
  };

  return (
    <div className="rail-col">
      <div className="card card-tight stack" style={{ gap: 10 }}>
        <input className="input" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }} value={look.title} onChange={(e) => setLook((l) => ({ ...l, title: e.target.value }))} aria-label="Look name" maxLength={60} />
        <div className="row" style={{ gap: 8 }}>
          <select className="select grow" value={look.castingType} onChange={(e) => setLook((l) => ({ ...l, castingType: e.target.value }))} aria-label="Casting type">
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title}
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={deleteLook} aria-label="Delete look">
            <Icon name="trash" />
          </button>
        </div>
        {type && <p className="tiny muted">{type.wardrobe}</p>}
      </div>

      <div className="rail">
        {ROLES.map((role) => {
          const slots = look.layers.filter((s) => s.role === role);
          const canAdd = role === "accessory" ? slots.length < 3 : slots.length === 0;
          return (
            <div className="slot-group" key={role}>
              <div className="slot-group-head">
                <span className="label">
                  <i style={{ background: ROLE_COLORS[role] }} /> {ROLE_LABELS[role]}
                </span>
                {slots.length === 0 && <span className="tiny muted">optional</span>}
              </div>
              <div className="stack" style={{ gap: 14 }}>
                {slots.map((s) => (
                  <SlotCard
                    key={s.id}
                    slot={s}
                    project={project}
                    ideas={type?.ideas[role] ?? []}
                    open={openSlot === s.id}
                    onToggle={() => setOpenSlot(openSlot === s.id ? null : s.id)}
                    onChange={(patch) => setSlot(s.id, patch)}
                    onRemove={() => setLook((l) => ({ ...l, layers: l.layers.filter((x) => x.id !== s.id) }))}
                  />
                ))}
                {canAdd && (
                  <button className="add-slot" onClick={() => addSlot(role)} title={ROLE_HINTS[role]}>
                    <Icon name="plus" size={15} /> Add {ROLE_ADD[role]}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StylePanel look={look} setLook={setLook} />

      <div className="generate-card">
        <div className="row-between">
          <b style={{ fontFamily: "var(--font-display)" }}>Preview this look</b>
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">Versions</span>
            <select className="select" value={variations} onChange={(e) => setVariations(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
        <button
          className="btn btn-hot"
          disabled={!canGenerate}
          onClick={() => {
            generate(look.id, variations);
            showMirror();
          }}
        >
          {running ? (
            <>
              <Spinner /> Developing…
            </>
          ) : (
            <>
              <Icon name="camera" /> {look.renders.length ? "Preview again" : "Preview this look"}
            </>
          )}
        </button>
        <span className="tiny muted">
          {!config?.imageProvider
            ? "Image generation isn't configured on the server yet."
            : !project.actor.photoIds.length
              ? "Add an actor photo on the Profile step first."
              : !hasWardrobe
                ? "Hang at least one piece on the rail."
                : "Takes 20–60 seconds. Every result is labeled as an AI simulation."}
        </span>
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  project,
  ideas,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  slot: LayerSlot;
  project: Project;
  ideas: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LayerSlot>) => void;
  onRemove: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const item = slot.itemId ? project.closet.find((c) => c.id === slot.itemId) : undefined;
  const label = describeGarment(slot) || item?.name;
  const suited = project.closet.filter((c) => defaultRoleFor(c.category) === slot.role);
  const others = project.closet.filter((c) => defaultRoleFor(c.category) !== slot.role);

  const useItem = (c: ClosetItem) => {
    const s = slotFromItem(slot.role, c);
    onChange({ itemId: c.id, garment: s.garment, colorName: s.colorName, colorHex: s.colorHex, details: s.details, neckline: "", fabric: "", fit: "" });
  };

  return (
    <div className={`slot ${open ? "open" : ""}`}>
      <button className="slot-summary" onClick={onToggle} aria-expanded={open}>
        <span className="slot-thumb" style={!item?.photoId && slot.colorHex ? { background: slot.colorHex } : undefined}>
          {item && (item.photoId || item.sourcePhotoId) ? <BlobImage id={item.photoId ?? item.sourcePhotoId} alt="" /> : !slot.colorHex && <Icon name="hanger" />}
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <b>{label || <span className="muted">Empty — tap to choose</span>}</b>
          <span className="muted">{item ? "From your wardrobe" : slot.garment ? "Described" : ROLE_HINTS[slot.role]}</span>
        </span>
        <Icon name={open ? "up" : "down"} size={16} />
      </button>

      {open && (
        <div className="slot-editor">
          {project.closet.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">From your wardrobe</span>
              <div className="picker">
                {[...suited, ...others].map((c) => (
                  <button key={c.id} className={`picker-item ${slot.itemId === c.id ? "on" : ""}`} onClick={() => (slot.itemId === c.id ? onChange({ itemId: undefined }) : useItem(c))} title={`${c.colorName} ${c.name} · ${CATEGORY_LABELS[c.category]}`}>
                    <span className="pt" style={!c.photoId && !c.sourcePhotoId ? { background: c.colorHex } : undefined}>
                      {(c.photoId || c.sourcePhotoId) && <BlobImage id={c.photoId ?? c.sourcePhotoId} alt="" />}
                    </span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="add-slot" onClick={() => setAdding(true)}>
            <Icon name="upload" size={15} /> Upload a photo of this piece
          </button>

          {ideas.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Ideas for this casting type</span>
              <div className="chips">
                {ideas.map((idea) => (
                  <button key={idea} className="chip" onClick={() => onChange({ itemId: undefined, garment: idea, colorName: "", colorHex: undefined, neckline: "", fabric: "", fit: "", details: "" })}>
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field">
            <span>Describe it</span>
            <input className="input" value={slot.garment} onChange={(e) => onChange({ garment: e.target.value })} placeholder="e.g. henley, denim jacket, knit beanie" maxLength={100} />
          </label>
          <div className="field">
            <span>Color</span>
            <div className="swatches">
              {COLOR_SWATCHES.map((c) => (
                <Swatch key={c.hex} hex={c.hex} label={c.name} size={22} active={slot.colorHex === c.hex} onClick={() => onChange({ colorHex: c.hex, colorName: c.name })} />
              ))}
            </div>
            <input className="input" value={slot.colorName} onChange={(e) => onChange({ colorName: e.target.value, colorHex: undefined })} placeholder="or type a color" maxLength={40} />
          </div>
          <div className="grid3">
            <Combo label="Neckline" value={slot.neckline} options={NECKLINES} onChange={(v) => onChange({ neckline: v })} />
            <Combo label="Fabric" value={slot.fabric} options={FABRICS} onChange={(v) => onChange({ fabric: v })} />
            <Combo label="Fit" value={slot.fit} options={FITS} onChange={(v) => onChange({ fit: v })} />
          </div>
          <label className="field">
            <span>Layering &amp; details</span>
            <input className="input" value={slot.details} onChange={(e) => onChange({ details: e.target.value })} placeholder="e.g. worn open, sleeves pushed up, tucked in" maxLength={200} />
          </label>
          <div className="row-between">
            <span className="tiny muted">{ROLE_HINTS[slot.role]}</span>
            <button className="btn btn-sm btn-ghost btn-danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      )}
      {adding && (
        <ItemEditor
          item={null}
          defaults={{
            name: slot.garment,
            colorName: slot.colorName,
            colorHex: slot.colorHex ?? "#9aa0a6",
            category: slot.role === "base" ? "top" : slot.role === "second" ? "layer" : slot.role === "outer" ? "outerwear" : "accessory",
          }}
          onClose={() => setAdding(false)}
          onSaved={useItem}
        />
      )}
    </div>
  );
}

function Combo({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const listId = `dl-${label.toLowerCase()}`;
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="any" maxLength={40} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

function StylePanel({ look, setLook }: { look: Look; setLook: (fn: (l: Look) => Look) => void }) {
  const b = look.backdrop;
  return (
    <details className="card card-tight style-panel">
      <summary>
        <span className="row" style={{ gap: 8 }}>
          <Swatch hex={b.colorHex} label={b.colorName} size={18} /> Background, expression &amp; framing
        </span>
        <Icon name="down" size={16} />
      </summary>
      <div className="stack">
        <div className="field">
          <span>Background color</span>
          <div className="swatches">
            {BACKDROP_SWATCHES.map((s) => (
              <Swatch key={s.colorHex} hex={s.colorHex} label={`${s.colorName} — ${s.style}`} active={b.colorHex === s.colorHex} onClick={() => setLook((l) => ({ ...l, backdrop: { ...s } }))} />
            ))}
            <label className="swatch" style={{ width: 26, height: 26, background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", position: "relative", overflow: "hidden" }} title="Custom color">
              <input
                type="color"
                value={b.colorHex}
                onChange={(e) => setLook((l) => ({ ...l, backdrop: { ...l.backdrop, colorHex: e.target.value, colorName: "custom color" } }))}
                style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer" }}
                aria-label="Custom background color"
              />
            </label>
          </div>
        </div>
        <label className="field">
          <span>Setting</span>
          <select className="select" value={b.style} onChange={(e) => setLook((l) => ({ ...l, backdrop: { ...l.backdrop, style: e.target.value } }))}>
            {Array.from(new Set([b.style, ...BACKDROP_STYLES])).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Expression</span>
          <select className="select" value={look.expression} onChange={(e) => setLook((l) => ({ ...l, expression: e.target.value }))}>
            {Array.from(new Set([look.expression, ...EXPRESSION_OPTIONS])).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hair (optional)</span>
          <input className="input" value={look.hair} onChange={(e) => setLook((l) => ({ ...l, hair: e.target.value }))} placeholder="Keep as in photo, or e.g. half-up, one side tucked behind ear" maxLength={160} />
        </label>
        <div className="field">
          <span>Framing</span>
          <div className="chips">
            {(Object.keys(FRAMING_LABELS) as Framing[]).map((f) => (
              <button key={f} className={`chip ${look.framing === f ? "on" : ""}`} onClick={() => setLook((l) => ({ ...l, framing: f }))}>
                {FRAMING_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
