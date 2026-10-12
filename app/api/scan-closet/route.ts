import { z } from "zod";
import { checkAccess, jsonError, parseDataUrl, scanProvider } from "@/lib/server/config";
import { recordSpend, reserveScan } from "@/lib/server/usage";
import { StylistError } from "@/lib/server/claude";
import { scanCostUsd, scanPhoto } from "@/lib/server/scanner";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  photo: z.string().refine((s) => parseDataUrl(s) !== null, "Photo must be a JPEG, PNG or WebP data URL."),
});

export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return denied;
  const provider = scanProvider();
  if (!provider) {
    return jsonError("Photo scanning isn't configured yet. Set GEMINI_API_KEY or ANTHROPIC_API_KEY on the server.", 503);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.");

  const cost = scanCostUsd(provider);
  const usage = await reserveScan(req, cost);
  if (!usage.ok) return jsonError(usage.message!, 429, { retryAfterSeconds: usage.retryAfterSeconds });

  try {
    const result = await scanPhoto(parsed.data.photo);
    await recordSpend({ route: "scan-closet", provider: result.provider, model: result.model, images: 0, usd: cost });
    return Response.json({ items: result.items });
  } catch (err) {
    if (err instanceof StylistError) return jsonError(err.message, err.status);
    console.error("scan-closet failed", err);
    return jsonError("Something went wrong scanning the photo.", 500);
  }
}
