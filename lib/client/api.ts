"use client";

import type { AppConfig } from "@/lib/types";

const ACCESS_KEY = "tryalook.accessCode";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export function getAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(ACCESS_KEY, code);
  } catch {
    /* private mode — the code just won't be remembered */
  }
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new ApiError("Couldn't reach Try A Look.", res.status);
  return res.json();
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-code": getAccessCode() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Network problem — check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    const fallback =
      res.status === 413 ? "Those photos are too large to send. Try fewer reference photos." : `Request failed (${res.status}).`;
    throw new ApiError(data.error || fallback, res.status, data.code);
  }
  return data as T;
}
