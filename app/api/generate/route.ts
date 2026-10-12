import { z } from "zod";
import { checkAccess, costPerImageUsd, jsonError, parseDataUrl } from "@/lib/server/config";
import { activeProvider, generateImages, ProviderError } from "@/lib/server/image-providers";
import { recordSpend, reserveGeneration } from "@/lib/server/usage";
import { buildImagePrompt, collectFreeText, findBlockedTerm } from "@/lib/prompt";
import type { GenerateRequest, ImageResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const dataUrl = z.string().refine((s) => parseDataUrl(s) !== null, "Images must be JPEG, PNG or WebP.");
const text = (max: number) => z.string().max(max).optional().default("");

const Body = z.object({
  actor: z.object({
    ageRange: text(40),
    photos: z.array(dataUrl).min(1, "Add a photo of the actor first.").max(3),
  }),
  look: z.object({
    hair: text(300),
    expression: text(300),
    backdrop: z.object({ colorName: text(60), colorHex: text(9), style: text(200) }),
    framing: z.enum(["tight", "chest", "waist"]).default("chest"),
    garments: z
      .array(
        z.object({
          role: z.enum(["base", "second", "outer", "accessory"]),
          garment: z.string().max(120),
          colorName: text(60),
          neckline: text(60),
          fabric: text(60),
          fit: text(60),
          details: text(700),
          image: dataUrl.optional(),
          isGroupPhoto: z.boolean().optional(),
          location: text(200),
        }),
      )
      .max(8),
  }),
  variations: z.number().int().min(1).max(2).default(1),
  engine: z.enum(["openai", "gemini"]).optional(),
});

export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return denied;

  let body: GenerateRequest;
  try {
    const result = Body.safeParse(await req.json());
    if (!result.success) return jsonError(result.error.issues[0]?.message ?? "Invalid request.");
    body = result.data as GenerateRequest;
  } catch {
    return jsonError("Request too large or malformed. Try fewer or smaller reference photos.", 413);
  }

  const blocked = findBlockedTerm(collectFreeText(body));
  if (blocked) {
    return jsonError(`"${blocked}" isn't headshot wardrobe — Try A Look keeps every outfit age-appropriate.`, 422);
  }

  const { prompt, images } = buildImagePrompt(body);
  if (images.length > 10) return jsonError("Too many reference photos in one look — use 10 or fewer.");

  try {
    const { provider } = activeProvider(body.engine);
    const usage = await reserveGeneration(req, body.variations, body.variations * costPerImageUsd(provider));
    if (!usage.ok) return jsonError(usage.message!, 429, { retryAfterSeconds: usage.retryAfterSeconds });

    const result = await generateImages({ prompt, images, variations: body.variations }, provider);
    await recordSpend({ route: "generate", provider: result.provider, model: result.model, images: result.images.length, usd: result.estimatedCostUsd });
    return Response.json(result satisfies ImageResponse);
  } catch (err) {
    if (err instanceof ProviderError) return jsonError(err.message, err.status);
    console.error("generate failed", err);
    return jsonError("Something went wrong generating the preview.", 500);
  }
}
