import "server-only";
import type { AppConfig } from "@/lib/types";

export type Provider = "openai" | "gemini";

export function imageProvider(): Provider | null {
  const explicit = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (explicit === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (explicit === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  // Gemini first: it takes more reference images and is cheaper per preview.
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function imageModel(provider: Provider): string {
  if (provider === "openai") return process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  return process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
}

/** Rough per-image cost used for budget caps and the in-app spend tracker. */
export function costPerImageUsd(provider: Provider): number {
  const configured = Number(process.env.COST_PER_IMAGE_USD);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return provider === "openai" ? 0.17 : 0.14;
}

export function scannerEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function limits() {
  return {
    perHour: intEnv("RATE_LIMIT_PER_HOUR", 20),
    perDay: intEnv("RATE_LIMIT_PER_DAY", 60),
    dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD) > 0 ? Number(process.env.DAILY_BUDGET_USD) : 25,
  };
}

export function appConfig(): AppConfig {
  const provider = imageProvider();
  const { perHour, perDay } = limits();
  return {
    imageProvider: provider,
    imageModel: provider ? imageModel(provider) : null,
    scannerEnabled: scannerEnabled(),
    accessCodeRequired: Boolean(process.env.ACCESS_CODE),
    limits: { perHour, perDay },
  };
}

/** Returns an error Response when the request lacks the shared access code. */
export function checkAccess(req: Request): Response | null {
  const code = process.env.ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get("x-access-code") === code) return null;
  return Response.json({ error: "Access code required.", code: "access" }, { status: 401 });
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export function parseDataUrl(url: string): { mime: string; data: string } | null {
  const m = DATA_URL.exec(url);
  return m ? { mime: m[1], data: m[2] } : null;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
