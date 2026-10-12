import "server-only";
import { z } from "zod";
import { parseDataUrl, scanProvider, type ScanProvider } from "./config";
import { askClaudeForJson, imageBlock, STYLIST_MODEL, StylistError } from "./claude";
import type { ItemCategory, ScannedItem } from "@/lib/types";

export const CATEGORIES: ItemCategory[] = ["top", "layer", "outerwear", "dress", "headwear", "accessory", "jewelry", "glasses"];

export const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || "gemini-flash-latest";

/** Rough cost of one scan, for the daily budget. */
export function scanCostUsd(provider: ScanProvider): number {
  return provider === "anthropic" ? 0.03 : 0.004;
}

export const SCAN_SCHEMA = {
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
              width: { type: "number" },
              height: { type: "number" },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the wardrobe assistant for Try A Look, a tool that helps families of young actors plan outfits for a headshot session.
You are shown one photo of clothing. It may be a single garment (a product photo, a flat lay, something on a hanger), several garments together (a rack, a bed, a closet), or a person wearing an outfit.
List every distinct wearable item that could appear in a chest-up headshot: tops, tees, tanks, sweaters, cardigans, jackets, hoodies, dresses, hats, headbands, glasses, jewelry and similar.
Skip hangers, furniture, backdrops, people's bodies and anything that is not clothing. Skip pants, skirts and shoes — they don't show in a headshot.
If the photo has no headshot-relevant clothing, return an empty list.
Name colors the way a stylist would. Be specific in descriptions about fabric and texture (ribbed knit, waffle, corduroy, cable knit, crochet) because an image model will recreate the garment from your words plus a crop.
Bounding boxes should cover the visible part of each item; overlapping boxes are fine. For a photo of a single garment the box is usually most of the image.`;

const RawItems = z.object({
  items: z
    .array(
      z.object({
        name: z.string().catch("Wardrobe item"),
        category: z.string().catch("top"),
        colorName: z.string().catch(""),
        colorHex: z.string().catch("#999999"),
        description: z.string().catch(""),
        location: z.string().catch(""),
        box: z
          .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
          .catch({ x: 0, y: 0, width: 1, height: 1 }),
      }),
    )
    .catch([]),
});

function normalize(raw: unknown): ScannedItem[] {
  const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  return RawItems.parse(raw)
    .items.slice(0, 20)
    .map((it) => ({
      name: it.name.slice(0, 60) || "Wardrobe item",
      category: (CATEGORIES as string[]).includes(it.category) ? (it.category as ItemCategory) : "top",
      colorName: it.colorName.slice(0, 40),
      colorHex: /^#[0-9a-f]{6}$/i.test(it.colorHex) ? it.colorHex : "#999999",
      description: it.description.slice(0, 300),
      location: it.location.slice(0, 160),
      box: { x: clamp(it.box.x), y: clamp(it.box.y), width: clamp(it.box.width), height: clamp(it.box.height) },
    }));
}

export async function scanPhoto(photo: string): Promise<{ items: ScannedItem[]; provider: ScanProvider; model: string }> {
  const provider = scanProvider();
  if (!provider) {
    throw new StylistError("Photo scanning isn't configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY on the server.", 503);
  }
  if (provider === "anthropic") {
    const raw = await askClaudeForJson<unknown>({
      system: SYSTEM,
      content: [imageBlock(photo), { type: "text", text: "List the headshot-relevant clothing items in this photo." }],
      schema: SCAN_SCHEMA,
      effort: "low",
    });
    return { items: normalize(raw), provider, model: STYLIST_MODEL };
  }
  return { items: normalize(await viaGemini(photo)), provider, model: GEMINI_VISION_MODEL };
}

async function viaGemini(photo: string): Promise<unknown> {
  const parsed = parseDataUrl(photo);
  if (!parsed) throw new StylistError("Invalid image.", 400);
  const base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(GEMINI_VISION_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: parsed.mime, data: parsed.data } },
            {
              text:
                "List the headshot-relevant clothing items in this photo. Reply with JSON only, matching this JSON Schema:\n" +
                JSON.stringify(SCAN_SCHEMA),
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (res.status === 429) throw new StylistError("The photo scanner is busy — try again in a minute.", 429);
  if (!res.ok) {
    const detail = await res.text();
    if (detail.includes("API_KEY_INVALID")) throw new StylistError("The scanner's API key is invalid.", 500);
    if (res.status === 404) throw new StylistError(`Scanner model "${GEMINI_VISION_MODEL}" was not found — check GEMINI_VISION_MODEL.`, 500);
    console.error("gemini scan error", res.status, detail.slice(0, 500));
    throw new StylistError(`Photo scanner error (${res.status}).`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (body.promptFeedback?.blockReason) throw new StylistError("The scanner couldn't read that photo.", 422);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new StylistError("The scanner returned an unreadable answer. Try again.");
  }
}
