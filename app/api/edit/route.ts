import { z } from "zod";
import { checkAccess, costPerImageUsd, jsonError, parseDataUrl } from "@/lib/server/config";
import { activeProvider, generateImages, ProviderError } from "@/lib/server/image-providers";
import { recordSpend, reserveGeneration } from "@/lib/server/usage";
import { buildEditPrompt, findBlockedTerm } from "@/lib/prompt";
import type { ImageResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const dataUrl = z.string().refine((s) => parseDataUrl(s) !== null, "Images must be JPEG, PNG or WebP.");

const Body = z.object({
  image: dataUrl,
  actorPhoto: dataUrl.optional(),
  garmentImage: dataUrl.optional(),
  instruction: z.string().trim().min(3, "Tell us what to change.").max(400),
  engine: z.enum(["openai", "gemini"]).optional(),
});

export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);

  const blocked = findBlockedTerm(parsed.data.instruction);
  if (blocked) {
    return jsonError(`"${blocked}" isn't headshot wardrobe — Try A Look keeps every outfit age-appropriate.`, 422);
  }

  const { prompt, images } = buildEditPrompt(parsed.data);
  try {
    const { provider } = activeProvider(parsed.data.engine);
    const usage = await reserveGeneration(req, 1, costPerImageUsd(provider));
    if (!usage.ok) return jsonError(usage.message!, 429, { retryAfterSeconds: usage.retryAfterSeconds });

    const result = await generateImages({ prompt, images, variations: 1 }, provider);
    await recordSpend({ route: "edit", provider: result.provider, model: result.model, images: result.images.length, usd: result.estimatedCostUsd });
    return Response.json(result satisfies ImageResponse);
  } catch (err) {
    if (err instanceof ProviderError) return jsonError(err.message, err.status);
    console.error("edit failed", err);
    return jsonError("Something went wrong editing the preview.", 500);
  }
}
