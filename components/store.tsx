"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppConfig, Consent, ImageResponse, Project, Render } from "@/lib/types";
import { ApiError, fetchConfig } from "@/lib/client/api";
import { blobIdsFor, blobUrl, db, removeBlobs } from "@/lib/client/db";
import { lookSummary, newProject } from "@/lib/client/factory";
import { buildGenerateRequest, requestEdit, requestGenerate, type Engine } from "@/lib/client/generate";
import { dataUrlToBlob, normalizePhoto } from "@/lib/client/images";
import { uid } from "@/lib/client/id";

export interface Job {
  id: string;
  projectId: string;
  lookId: string;
  kind: "generate" | "edit";
  label: string;
  startedAt: number;
  status: "running" | "error";
  error?: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface Store {
  ready: boolean;
  config: AppConfig | null;
  projects: Project[];
  project: Project | null;
  selectProject: (id: string | null) => void;
  createProject: (name: string, consent: Omit<Consent, "version">) => Project;
  update: (fn: (p: Project) => Project) => void;
  deleteProject: (id: string) => Promise<void>;
  wipeEverything: () => Promise<void>;
  jobs: Job[];
  generate: (lookId: string, count: number) => void;
  edit: (lookId: string, renderId: string, instruction: string, garmentPhotoId?: string) => void;
  dismissJob: (id: string) => void;
  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
  /** Image engine the user picked (null = server default). */
  engine: Engine | null;
  setEngine: (e: Engine) => void;
  needsAccessCode: boolean;
  setNeedsAccessCode: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);
const CURRENT_KEY = "tryalook.currentProject";

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [needsAccessCode, setNeedsAccessCode] = useState(false);
  const [engine, setEngineState] = useState<Engine | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const setEngine = useCallback((e: Engine) => {
    engineRef.current = e;
    setEngineState(e);
    try {
      localStorage.setItem("tryalook.engine", e);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!config) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("tryalook.engine");
    } catch {
      /* ignore */
    }
    const pick = config.imageProviders.find((p) => p === saved) ?? config.imageProvider;
    engineRef.current = pick;
    setEngineState(pick);
  }, [config]);

  useEffect(() => {
    (async () => {
      const [list, cfg] = await Promise.all([db.listProjects().catch(() => []), fetchConfig().catch(() => null)]);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      projectsRef.current = list;
      setProjects(list);
      setConfig(cfg);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(CURRENT_KEY);
      } catch {
        /* ignore */
      }
      setCurrentId(list.find((p) => p.id === saved)?.id ?? list[0]?.id ?? null);
      setReady(true);
    })();
  }, []);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = uid();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);

  const commit = useCallback((next: Project[]) => {
    projectsRef.current = next;
    setProjects(next);
  }, []);

  const updateProject = useCallback(
    (id: string, fn: (p: Project) => Project) => {
      const current = projectsRef.current.find((p) => p.id === id);
      if (!current) return;
      const next = { ...fn(current), updatedAt: Date.now() };
      commit(projectsRef.current.map((p) => (p.id === id ? next : p)));
      db.saveProject(next).catch(() => toast("Couldn't save to this browser's storage.", "error"));
    },
    [commit, toast],
  );

  const selectProject = useCallback((id: string | null) => {
    setCurrentId(id);
    try {
      if (id) localStorage.setItem(CURRENT_KEY, id);
      else localStorage.removeItem(CURRENT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const createProject = useCallback(
    (name: string, consent: Omit<Consent, "version">) => {
      const p = newProject(name, consent);
      commit([p, ...projectsRef.current]);
      db.saveProject(p);
      selectProject(p.id);
      return p;
    },
    [commit, selectProject],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const p = projectsRef.current.find((x) => x.id === id);
      if (!p) return;
      await removeBlobs(blobIdsFor(p));
      await db.deleteProjectRecord(id);
      const rest = projectsRef.current.filter((x) => x.id !== id);
      commit(rest);
      if (currentId === id) selectProject(rest[0]?.id ?? null);
    },
    [commit, currentId, selectProject],
  );

  const wipeEverything = useCallback(async () => {
    await removeBlobs(projectsRef.current.flatMap(blobIdsFor));
    await db.wipeEverything();
    commit([]);
    selectProject(null);
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  }, [commit, selectProject]);

  const addRender = useCallback(
    async (projectId: string, lookId: string, res: ImageResponse, extra: Partial<Render>) => {
      const p = projectsRef.current.find((x) => x.id === projectId);
      const look = p?.looks.find((l) => l.id === lookId);
      if (!p || !look) return;
      const renders: Render[] = [];
      for (const url of res.images) {
        const blob = await normalizePhoto(await dataUrlToBlob(url), 2048);
        const imageId = uid("img");
        await db.putBlob(imageId, blob);
        await blobUrl(imageId);
        renders.push({
          id: uid("r"),
          imageId,
          createdAt: Date.now(),
          provider: res.provider,
          model: res.model,
          kind: "generate",
          summary: lookSummary(look),
          ...extra,
        });
      }
      updateProject(projectId, (proj) => ({
        ...proj,
        spend: { images: proj.spend.images + renders.length, usd: +(proj.spend.usd + res.estimatedCostUsd).toFixed(3) },
        looks: proj.looks.map((l) =>
          l.id === lookId ? { ...l, renders: [...l.renders, ...renders], selectedRenderId: renders[renders.length - 1]?.id ?? l.selectedRenderId } : l,
        ),
      }));
    },
    [updateProject],
  );

  const runJob = useCallback(
    async (job: Omit<Job, "id" | "startedAt" | "status">, work: () => Promise<void>) => {
      const id = uid("job");
      setJobs((j) => [...j, { ...job, id, startedAt: Date.now(), status: "running" }]);
      try {
        await work();
        setJobs((j) => j.filter((x) => x.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (err instanceof ApiError && err.code === "access") setNeedsAccessCode(true);
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, status: "error", error: message } : x)));
      }
    },
    [],
  );

  const generate = useCallback(
    (lookId: string, count: number) => {
      const p = projectsRef.current.find((x) => x.id === currentId);
      const look = p?.looks.find((l) => l.id === lookId);
      if (!p || !look) return;
      if (!p.actor.photoIds.length) {
        toast("Add a photo of the actor on the Profile step first.", "error");
        return;
      }
      for (let i = 0; i < count; i++) {
        runJob({ projectId: p.id, lookId, kind: "generate", label: look.title }, async () => {
          const body = { ...(await buildGenerateRequest(p, look)), engine: engineRef.current ?? undefined };
          const res = await requestGenerate(body);
          await addRender(p.id, lookId, res, { kind: "generate" });
        });
      }
    },
    [addRender, currentId, runJob, toast],
  );

  const edit = useCallback(
    (lookId: string, renderId: string, instruction: string, garmentPhotoId?: string) => {
      const p = projectsRef.current.find((x) => x.id === currentId);
      const look = p?.looks.find((l) => l.id === lookId);
      const render = look?.renders.find((r) => r.id === renderId);
      if (!p || !look || !render) return;
      runJob({ projectId: p.id, lookId, kind: "edit", label: instruction }, async () => {
        const res = await requestEdit({ project: p, renderImageId: render.imageId, instruction, garmentPhotoId, engine: engineRef.current ?? undefined });
        await addRender(p.id, lookId, res, {
          kind: "edit",
          instruction,
          parentId: render.id,
          summary: `${render.summary} → ${instruction}`,
        });
      });
    },
    [addRender, currentId, runJob],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      config,
      projects,
      project: projects.find((p) => p.id === currentId) ?? null,
      selectProject,
      createProject,
      update: (fn) => currentId && updateProject(currentId, fn),
      deleteProject,
      wipeEverything,
      jobs,
      generate,
      edit,
      dismissJob: (id) => setJobs((j) => j.filter((x) => x.id !== id)),
      toasts,
      toast,
      engine,
      setEngine,
      needsAccessCode,
      setNeedsAccessCode,
    }),
    [ready, config, projects, currentId, selectProject, createProject, updateProject, deleteProject, wipeEverything, jobs, generate, edit, toasts, toast, engine, setEngine, needsAccessCode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
