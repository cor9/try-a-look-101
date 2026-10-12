import "server-only";
import type { AppConfig } from "@/lib/types";

export type Provider = "openai" | "gemini";

/** Image engines that have a key configured. */
export function availableProviders(): Provider[] {
  const out: Provider[] = [];
  if (process.env.OPENAI_API_KEY) out.push("openai");
  if (process.env.GEMINI_API_KEY) out.push("gemini");
  return out;
}

/** The default image engine: IMAGE_PROVIDER if set, otherwise OpenAI (best at keeping a real face), then Gemini. */
export function imageProvider(): Provider | null {
  const available = availableProviders();
  const explicit = process.env.IMAGE_PROVIDER?.toLowerCase() as Provider | undefined;
  if (explicit && available.includes(explicit)) return explicit;
  return available[0] ?? null;
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

export type ScanProvider = "anthropic" | "gemini";

/** Which model reads wardrobe photos: Claude when configured, otherwise Gemini's text/vision model. */
export function scanProvider(): ScanProvider | null {
  const explicit = process.env.SCAN_PROVIDER?.toLowerCase();
  if (explicit === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (explicit === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function scannerEnabled(): boolean {
  return scanProvider() !== null;
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
    // Photo scans are cheap and come in batches (a whole album), so they get their own allowance.
    scansPerHour: intEnv("SCAN_LIMIT_PER_HOUR", 150),
    scansPerDay: intEnv("SCAN_LIMIT_PER_DAY", 400),
  };
}

export function appConfig(): AppConfig {
  const provider = imageProvider();
  const { perHour, perDay } = limits();
  return {
    imageProvider: provider,
    imageModel: provider ? imageModel(provider) : null,
    imageProviders: availableProviders(),
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
