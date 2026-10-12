import { z } from "zod";
import { checkAccess, jsonError, parseDataUrl, scannerEnabled } from "@/lib/server/config";
import { recordSpend, reserveGeneration } from "@/lib/server/usage";
import { askClaudeForJson, imageBlock, STYLIST_MODEL, StylistError } from "@/lib/server/claude";
import type { ItemCategory, ScannedItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const CATEGORIES: ItemCategory[] = ["top", "layer", "outerwear", "dress", "headwear", "accessory", "jewelry", "glasses"];

const SCAN_COST_USD = 0.03;

const Body = z.object({
  photo: z.string().refine((s) => parseDataUrl(s) !== null, "Photo must be a JPEG, PNG or WebP data URL."),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "colorName", "colorHex", "description", "location", "box"],
        properties: {
          name: { type: "string", description: "Short garment name, e.g. 'Striped Long-Sleeve Tee'" },
          category: { type: "string", enum: CATEGORIES },
          colorName: { type: "string", description: "Wardrobe-style color name, e.g. 'Olive', 'Dusty Rose'" },
          colorHex: { type: "string", description: "Dominant color as #rrggbb" },
          description: {
            type: "string",
            description: "Fabric, texture, neckline, sleeve length, pattern — enough to recreate it",
          },
          location: {
            type: "string",
            description: "Where it is in the photo so it can be told apart, e.g. 'third from left, behind the pink tank'",
          },
          box: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            description: "Approximate visible bounding box, as fractions (0-1) of image width/height from the top-left",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              height: { type: "number" },
              width: { type: "number" },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the wardrobe assistant for Try A Look, a tool that helps families of young actors plan outfits for a headshot session.
You are shown a photo of clothing laid out or hung up (a rack, a bed, a closet). List every distinct wearable item that could appear in a chest-up headshot: tops, tees, tanks, sweaters, cardigans, jackets, hoodies, dresses, hats, headbands, glasses, jewelry and similar.
Skip hangers, furniture, backdrops and anything that is not clothing. Skip pants and shoes — they don't show in a headshot.
Name colors the way a stylist would. Be specific in descriptions about fabric and texture (ribbed knit, waffle, corduroy, cable knit, crochet) because an image model will recreate the garment from your words plus a crop.
Bounding boxes should cover the visible part of each item; overlapping boxes are fine.`;

export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return denied;
  if (!scannerEnabled()) {
    return jsonError("Closet scanning isn't configured yet. Set ANTHROPIC_API_KEY on the server, or add items by hand.", 503);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.");

  // A scan counts as one request against the same per-visitor limits.
  const usage = await reserveGeneration(req, 1, SCAN_COST_USD);
  if (!usage.ok) return jsonError(usage.message!, 429, { retryAfterSeconds: usage.retryAfterSeconds });

  try {
    const result = await askClaudeForJson<{ items: ScannedItem[] }>({
      system: SYSTEM,
      content: [imageBlock(parsed.data.photo), { type: "text", text: "List the headshot-relevant clothing items in this photo." }],
      schema: SCHEMA,
      effort: "medium",
    });
    const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
    const items = result.items.map((it) => ({
      ...it,
      category: CATEGORIES.includes(it.category) ? it.category : "top",
      colorHex: /^#[0-9a-f]{6}$/i.test(it.colorHex) ? it.colorHex : "#999999",
      box: { x: clamp(it.box.x), y: clamp(it.box.y), width: clamp(it.box.width), height: clamp(it.box.height) },
    }));
    await recordSpend({ route: "scan-closet", provider: "anthropic", model: STYLIST_MODEL, images: 0, usd: SCAN_COST_USD });
    return Response.json({ items });
  } catch (err) {
    if (err instanceof StylistError) return jsonError(err.message, err.status);
    console.error("scan-closet failed", err);
    return jsonError("Something went wrong scanning the photo.", 500);
  }
}
