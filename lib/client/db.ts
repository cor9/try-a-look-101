"use client";

import type { Project } from "@/lib/types";

// Everything a family uploads or generates lives here, in this browser only.
// Nothing is stored on the Try A Look server.

const DB_NAME = "tryalook";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const db = {
  listProjects: () => tx<Project[]>("projects", "readonly", (s) => s.getAll()),
  saveProject: (p: Project) => tx("projects", "readwrite", (s) => s.put(p)),
  deleteProjectRecord: (id: string) => tx("projects", "readwrite", (s) => s.delete(id)),
  putBlob: (id: string, blob: Blob) => tx("blobs", "readwrite", (s) => s.put(blob, id)),
  getBlob: (id: string) => tx<Blob | undefined>("blobs", "readonly", (s) => s.get(id)),
  deleteBlob: (id: string) => tx("blobs", "readwrite", (s) => s.delete(id)),
  async wipeEverything() {
    await tx("projects", "readwrite", (s) => s.clear());
    await tx("blobs", "readwrite", (s) => s.clear());
  },
};

/** Every blob id a project references, so deleting a project leaves nothing behind. */
export function blobIdsFor(p: Project): string[] {
  return [
    ...p.actor.photoIds,
    ...p.closet.flatMap((c) => [c.photoId, c.sourcePhotoId].filter((x): x is string => Boolean(x))),
    ...p.looks.flatMap((l) => l.renders.map((r) => r.imageId)),
  ];
}

const urlCache = new Map<string, string>();

export async function blobUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await db.getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function removeBlobs(ids: string[]) {
  for (const id of new Set(ids)) {
    const url = urlCache.get(id);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(id);
    await db.deleteBlob(id);
  }
}
