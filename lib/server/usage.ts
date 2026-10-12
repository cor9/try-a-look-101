import "server-only";
import { createHash } from "node:crypto";
import { clientIp, limits } from "./config";

// Rate limiting + spend tracking.
//
// With Upstash Redis configured (UPSTASH_REDIS_REST_URL/TOKEN, or the KV_REST_API_*
// names Vercel's marketplace integration sets) counters are shared across every
// server instance. Without it we fall back to per-instance memory, which still
// stops a single runaway client but is best-effort on serverless.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const memory = new Map<string, { value: number; expiresAt: number }>();

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const rows = (await res.json()) as { result?: unknown; error?: string }[];
  return rows.map((r) => r.result);
}

async function incrBy(key: string, amount: number, ttlSeconds: number): Promise<number> {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const [value] = await redis([
        ["INCRBYFLOAT", key, amount],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]);
      return Number(value);
    } catch (err) {
      console.error("usage: redis unavailable, falling back to memory", err);
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  const next = entry && entry.expiresAt > now ? entry.value + amount : amount;
  memory.set(key, { value: next, expiresAt: entry && entry.expiresAt > now ? entry.expiresAt : now + ttlSeconds * 1000 });
  return next;
}

async function get(key: string): Promise<number> {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const [value] = await redis([["GET", key]]);
      return Number(value ?? 0);
    } catch {
      /* fall through to memory */
    }
  }
  const entry = memory.get(key);
  return entry && entry.expiresAt > Date.now() ? entry.value : 0;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "tryalook"}:${ip}`).digest("hex").slice(0, 16);
}

const day = () => new Date().toISOString().slice(0, 10);
const hour = () => new Date().toISOString().slice(0, 13);

export interface UsageCheck {
  ok: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Reserve `images` generations for this client. Call before hitting the image
 * API; counts are consumed even if the provider later fails (keeps retries honest).
 */
export async function reserveGeneration(req: Request, images: number, estimatedUsd: number): Promise<UsageCheck> {
  const { perHour, perDay, dailyBudgetUsd } = limits();
  const who = hashIp(clientIp(req));

  const spentToday = await get(`tal:spend:${day()}`);
  if (spentToday + estimatedUsd > dailyBudgetUsd) {
    return { ok: false, message: "Try A Look has hit today's generation budget. Please try again tomorrow.", retryAfterSeconds: 3600 };
  }
  const hourly = await incrBy(`tal:rl:h:${hour()}:${who}`, images, 3600);
  if (hourly > perHour) {
    return { ok: false, message: `You've made ${perHour} previews this hour — take a breather and try again soon.`, retryAfterSeconds: 900 };
  }
  const daily = await incrBy(`tal:rl:d:${day()}:${who}`, images, 86400);
  if (daily > perDay) {
    return { ok: false, message: `That's the daily limit of ${perDay} previews. Come back tomorrow!`, retryAfterSeconds: 3600 };
  }
  return { ok: true };
}

/** Reserve one wardrobe-photo scan for this client (separate, larger allowance than previews). */
export async function reserveScan(req: Request, estimatedUsd: number): Promise<UsageCheck> {
  const { scansPerHour, scansPerDay, dailyBudgetUsd } = limits();
  const who = hashIp(clientIp(req));
  const spentToday = await get(`tal:spend:${day()}`);
  if (spentToday + estimatedUsd > dailyBudgetUsd) {
    return { ok: false, message: "Try A Look has hit today's AI budget. Please try again tomorrow.", retryAfterSeconds: 3600 };
  }
  if ((await incrBy(`tal:scan:h:${hour()}:${who}`, 1, 3600)) > scansPerHour) {
    return { ok: false, message: `That's ${scansPerHour} photo scans this hour — the rest can be added in a bit.`, retryAfterSeconds: 900 };
  }
  if ((await incrBy(`tal:scan:d:${day()}:${who}`, 1, 86400)) > scansPerDay) {
    return { ok: false, message: `That's the daily limit of ${scansPerDay} photo scans. Come back tomorrow!`, retryAfterSeconds: 3600 };
  }
  return { ok: true };
}

/** Record actual spend after a successful generation and log it for cost reporting. */
export async function recordSpend(entry: { route: string; provider: string; model: string; images: number; usd: number }) {
  await incrBy(`tal:spend:${day()}`, entry.usd, 2 * 86400);
  await incrBy(`tal:images:${day()}`, entry.images, 2 * 86400);
  // Structured log line — searchable in Vercel logs for cost reporting.
  console.log(JSON.stringify({ event: "tryalook.generation", at: new Date().toISOString(), ...entry }));
}
