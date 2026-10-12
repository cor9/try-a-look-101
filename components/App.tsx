"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StoreProvider, useStore } from "./store";
import { Icon, Modal, Spinner, confirmAction } from "./ui";
import { NewProjectDialog } from "./NewProjectDialog";
import { Welcome } from "./Welcome";
import { ProfileTab } from "./ProfileTab";
import { WardrobeTab } from "./WardrobeTab";
import { StudioTab } from "./StudioTab";
import { BoardTab } from "./BoardTab";
import { PlanTab } from "./PlanTab";
import { setAccessCode } from "@/lib/client/api";

export type Tab = "profile" | "wardrobe" | "studio" | "board" | "plan";

const TABS: { key: Tab; label: string; long: string; color: string }[] = [
  { key: "profile", label: "Actor", long: " profile", color: "var(--blue)" },
  { key: "wardrobe", label: "Wardrobe", long: " inventory", color: "var(--teal)" },
  { key: "studio", label: "Studio", long: " · build looks", color: "var(--red)" },
  { key: "board", label: "Look board", long: "", color: "var(--orange)" },
  { key: "plan", label: "Session plan", long: "", color: "var(--navy)" },
];

export function TryALookApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { ready, project, projects, selectProject, config, toasts, needsAccessCode, setNeedsAccessCode, jobs } = useStore();
  const [tab, setTab] = useState<Tab>("profile");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tryalook.tab") as Tab | null;
      if (saved && TABS.some((t) => t.key === saved)) setTab(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("tryalook.tab", t);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (config?.accessCodeRequired) {
      let code = "";
      try {
        code = localStorage.getItem("tryalook.accessCode") ?? "";
      } catch {
        /* ignore */
      }
      if (!code) setNeedsAccessCode(true);
    }
  }, [config, setNeedsAccessCode]);

  const running = jobs.filter((j) => j.status === "running").length;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Try A Look home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Try A Look" />
            <span className="brand-sub">
              <b>Headshot wardrobe planner</b>A Child Actor 101 app
            </span>
          </Link>
          {projects.length > 0 && (
            <div className="project-switch">
              {running > 0 && (
                <span className="row small muted" title="Previews in progress">
                  <Spinner /> {running}
                </span>
              )}
              <select
                className="select"
                value={project?.id ?? ""}
                onChange={(e) => (e.target.value === "__new" ? setCreating(true) : selectProject(e.target.value))}
                aria-label="Project"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new">+ New project…</option>
              </select>
            </div>
          )}
        </div>
        {project && (
          <nav className="steps" aria-label="Steps">
            {TABS.map((t, i) => (
              <button
                key={t.key}
                className={`step ${tab === t.key ? "active" : ""}`}
                style={{ ["--step-color" as string]: t.color }}
                onClick={() => go(t.key)}
                aria-current={tab === t.key ? "step" : undefined}
              >
                <span className="step-num">{i + 1}</span>
                <span>
                  {t.label}
                  <span className="step-label-long">{t.long}</span>
                </span>
                {t.key === "board" && project.looks.length > 0 && <span className="step-count">{project.looks.length}</span>}
              </button>
            ))}
          </nav>
        )}
      </header>

      {!ready ? (
        <div className="main" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
          <Spinner />
        </div>
      ) : !project ? (
        <Welcome onStart={() => setCreating(true)} />
      ) : (
        <main className="main">
          {config && !config.imageProvider && <SetupBanner />}
          {tab === "profile" && <ProfileTab onNext={() => go("wardrobe")} />}
          {tab === "wardrobe" && <WardrobeTab onNext={() => go("studio")} />}
          {tab === "studio" && <StudioTab />}
          {tab === "board" && <BoardTab onOpenLook={() => go("studio")} />}
          {tab === "plan" && <PlanTab />}
        </main>
      )}

      <footer className="footer">
        Every image Try A Look makes is an <b>AI wardrobe simulation</b>, not a photograph. Photos stay in this browser.{" "}
        <Link href="/privacy">Privacy &amp; safety</Link> · <a href="https://childactor101.com">Child Actor 101</a>
      </footer>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} onCreated={() => go("profile")} />}
      {needsAccessCode && <AccessCodeDialog onDone={() => setNeedsAccessCode(false)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupBanner() {
  return (
    <div className="notice notice-warn" style={{ marginBottom: 18 }}>
      <Icon name="shield" />
      <div>
        <b>Image generation isn&apos;t switched on yet.</b> You can set up profiles, wardrobe and looks now. To make previews,
        the site owner needs to add <code>OPENAI_API_KEY</code> or <code>GEMINI_API_KEY</code> to the server
        environment — see the README.
      </div>
    </div>
  );
}

function AccessCodeDialog({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  return (
    <Modal
      title="Enter your access code"
      footer={
        <button
          className="btn btn-primary"
          disabled={!code.trim()}
          onClick={() => {
            setAccessCode(code.trim());
            onDone();
          }}
        >
          Continue
        </button>
      }
    >
      <p className="muted">
        Try A Look is in early access for Child Actor 101 families. Enter the code you were given to make previews.
      </p>
      <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" autoFocus />
    </Modal>
  );
}

export function DangerZone() {
  const { project, deleteProject, wipeEverything, toast } = useStore();
  if (!project) return null;
  return (
    <div className="card stack">
      <h3>Your data</h3>
      <p className="small muted">
        Photos and previews for this project are stored only in this browser. Deleting removes them from this device
        immediately. Consent recorded {new Date(project.consent.acceptedAt).toLocaleDateString()} (
        {project.consent.role === "guardian" ? "parent/guardian" : "adult actor"}).
      </p>
      <div className="row">
        <button
          className="btn btn-sm btn-danger"
          onClick={async () => {
            if (confirmAction(`Delete "${project.name}" and every photo and preview in it? This can't be undone.`)) {
              await deleteProject(project.id);
              toast("Project deleted from this device.", "success");
            }
          }}
        >
          <Icon name="trash" size={16} /> Delete this project
        </button>
        <button
          className="btn btn-sm btn-ghost btn-danger"
          onClick={async () => {
            if (confirmAction("Delete ALL Try A Look projects, photos and previews from this browser?")) {
              await wipeEverything();
              toast("All Try A Look data removed from this device.", "success");
            }
          }}
        >
          Delete everything
        </button>
      </div>
    </div>
  );
}
