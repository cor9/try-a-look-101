"use client";

import { useState } from "react";
import { useStore } from "./store";
import { AiBadge, BlobImage, Icon, Spinner } from "./ui";
import { findCastingType } from "@/lib/presets";
import { lookSummary } from "@/lib/client/factory";
import { packingList } from "@/lib/client/plan";
import type { Look } from "@/lib/types";

const COLORS = ["var(--blue)", "var(--teal)", "var(--red)", "var(--orange)"];

export function PlanTab() {
  const { project, update, toast } = useStore();
  const [exporting, setExporting] = useState(false);
  if (!project) return null;
  const { plan } = project;
  const planned = plan.lookIds.map((id) => project.looks.find((l) => l.id === id)).filter((l): l is Look => Boolean(l));
  const available = project.looks.filter((l) => !plan.lookIds.includes(l.id));
  const pack = packingList(project);

  const setPlan = (fn: (p: typeof plan) => typeof plan) => update((p) => ({ ...p, plan: fn(p.plan) }));
  const move = (i: number, d: -1 | 1) =>
    setPlan((p) => {
      const ids = [...p.lookIds];
      const j = i + d;
      if (j < 0 || j >= ids.length) return p;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...p, lookIds: ids };
    });

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { downloadPlanPdf } = await import("@/lib/client/pdf");
      await downloadPlanPdf(project);
      toast("Wardrobe plan downloaded.", "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't build the PDF. Try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <span className="eyebrow">Step 5</span>
          <h1>Session plan</h1>
          <p>Put the looks in shooting order, jot down prep notes, and take the packing list (and PDF) to the shoot.</p>
        </div>
        <button className="btn btn-hot" onClick={exportPdf} disabled={!planned.length || exporting}>
          {exporting ? <Spinner /> : <Icon name="download" />} Download PDF plan
        </button>
      </div>

      <div className="plan-grid">
        <div className="stack">
          <div className="card card-tight">
            <div className="row" style={{ gap: 12 }}>
              <label className="field grow" style={{ minWidth: 160 }}>
                <span>Session date</span>
                <input className="input" type="date" value={plan.sessionDate} onChange={(e) => setPlan((p) => ({ ...p, sessionDate: e.target.value }))} />
              </label>
              <label className="field grow" style={{ minWidth: 160 }}>
                <span>Photographer</span>
                <input className="input" value={plan.photographer} onChange={(e) => setPlan((p) => ({ ...p, photographer: e.target.value }))} placeholder="Studio or photographer" maxLength={60} />
              </label>
            </div>
          </div>

          {planned.length === 0 ? (
            <div className="empty">
              <Icon name="list" size={34} />
              <h3>No looks in the plan yet</h3>
              <p className="muted small">Add looks below, or use &ldquo;Add to plan&rdquo; on the Look board.</p>
            </div>
          ) : (
            planned.map((l, i) => {
              const r = l.renders.find((x) => x.id === l.selectedRenderId) ?? l.renders[l.renders.length - 1];
              const type = findCastingType(l.castingType, project.customCastingTypes);
              return (
                <div className="plan-look" key={l.id}>
                  <span className="plan-num" style={{ background: COLORS[i % COLORS.length] }}>
                    {i + 1}
                  </span>
                  <div className="plan-thumb" style={{ position: "relative" }}>
                    {r && <BlobImage id={r.imageId} alt={l.title} />}
                    {r && (
                      <span style={{ position: "absolute", left: 4, bottom: 4 }}>
                        <AiBadge small />
                      </span>
                    )}
                  </div>
                  <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                    <div>
                      <span className="eyebrow" style={{ color: COLORS[i % COLORS.length] }}>
                        Look {i + 1}
                        {type ? `: ${type.title}` : ""}
                      </span>
                      <h3>{l.title}</h3>
                      <p className="small">{lookSummary(l)}</p>
                    </div>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 48 }}
                      value={plan.lookNotes[l.id] ?? ""}
                      onChange={(e) => setPlan((p) => ({ ...p, lookNotes: { ...p.lookNotes, [l.id]: e.target.value } }))}
                      placeholder="Notes for this look — e.g. steam the henley, hair half-up for this one"
                      maxLength={400}
                    />
                  </div>
                  <div className="plan-move">
                    <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <Icon name="up" />
                    </button>
                    <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === planned.length - 1} aria-label="Move down">
                      <Icon name="down" />
                    </button>
                    <button className="icon-btn" onClick={() => setPlan((p) => ({ ...p, lookIds: p.lookIds.filter((x) => x !== l.id) }))} aria-label="Remove from plan">
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {available.length > 0 && (
            <div className="card card-tight stack" style={{ gap: 8 }}>
              <span className="label">Add a look to the plan</span>
              <div className="add-to-plan">
                {available.map((l) => {
                  const r = l.renders.find((x) => x.id === l.selectedRenderId) ?? l.renders[l.renders.length - 1];
                  return (
                    <button key={l.id} onClick={() => setPlan((p) => ({ ...p, lookIds: [...p.lookIds, l.id] }))} title={l.title}>
                      <div className="t">{r && <BlobImage id={r.imageId} alt="" />}</div>
                      <span>
                        {l.favorite ? "★ " : ""}
                        {l.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card stack">
            <div className="row-between">
              <h3>Packing checklist</h3>
              <span className="small muted">
                {pack.filter((x) => plan.packed[x.key]).length}/{pack.length} packed
              </span>
            </div>
            {pack.length === 0 ? (
              <p className="small muted">Garments from planned looks show up here.</p>
            ) : (
              <ul className="pack-list">
                {pack.map((it) => (
                  <li key={it.key}>
                    <label>
                      <input type="checkbox" checked={Boolean(plan.packed[it.key])} onChange={(e) => setPlan((p) => ({ ...p, packed: { ...p.packed, [it.key]: e.target.checked } }))} />
                      <span className={`grow ${plan.packed[it.key] ? "done" : ""}`}>{it.label}</span>
                      <span className="tiny muted">Look {it.looks.join(", ")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card stack">
            <h3>Prep notes</h3>
            <textarea
              className="textarea"
              style={{ minHeight: 140 }}
              value={plan.prepNotes}
              onChange={(e) => setPlan((p) => ({ ...p, prepNotes: e.target.value }))}
              placeholder={"• Wash and steam everything the night before\n• No new haircuts the week of the shoot\n• Bring backup solid tees\n• Lip balm, water, snack"}
              maxLength={2000}
            />
          </div>
          <p className="tiny muted">
            {project.spend.images} preview{project.spend.images === 1 ? "" : "s"} generated for this project (est. ${project.spend.usd.toFixed(2)} in AI costs).
          </p>
        </div>
      </div>
    </div>
  );
}
