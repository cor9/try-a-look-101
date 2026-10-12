import type { EditRequest, GenerateGarment, GenerateRequest, LayerRole, LayerSlot } from "./types";

// Free-text guard. Most Try A Look users are photographing minors, so anything
// that isn't headshot wardrobe gets bounced before it reaches an image model.
const BLOCKED_TERMS = [
  "bikini",
  "swimsuit",
  "swimwear",
  "lingerie",
  "underwear",
  "bra",
  "panties",
  "thong",
  "nude",
  "naked",
  "topless",
  "shirtless",
  "sexy",
  "seductive",
  "see-through",
  "cleavage",
  "provocative",
  "makeup heavy",
  "older looking",
];

export function findBlockedTerm(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of BLOCKED_TERMS) {
    const pattern = term.replace(/[-\s]/g, "[-\\s]?");
    if (new RegExp(`\\b${pattern}\\b`).test(lower)) return term;
  }
  return null;
}

const FRAMING_TEXT: Record<GenerateRequest["look"]["framing"], string> = {
  tight: "a tight headshot cropped at the shoulders, eyes in the upper third of the frame",
  chest: "a classic chest-up headshot, eyes in the upper third of the frame, wardrobe clearly visible",
  waist: "a three-quarter shot from the waist up, so the full layered outfit is visible",
};

const ROLE_ORDER: LayerRole[] = ["base", "second", "outer", "accessory"];

const ROLE_TEXT: Record<LayerRole, string> = {
  base: "Base layer (closest to the body)",
  second: "Second layer (worn over the base layer, open unless described otherwise so the base layer shows)",
  outer: "Outerwear (the top layer, worn open so the layers underneath show)",
  accessory: "Accessory",
};

/** One-line human description of a garment, e.g. "forest green ribbed-knit crew neck sweater". */
export function describeGarment(g: Pick<LayerSlot, "garment" | "colorName" | "neckline" | "fabric" | "fit" | "details">): string {
  const garment = g.garment?.trim() ?? "";
  const lower = garment.toLowerCase();
  // Skip descriptors the garment name already contains ("Olive Button-Up" + "olive").
  const extra = (s?: string) => (s?.trim() && !lower.includes(s.trim().toLowerCase()) ? s.trim() : "");
  const main = [extra(g.fit), extra(g.colorName), extra(g.fabric), extra(g.neckline), garment].filter(Boolean).join(" ");
  return [main, g.details?.trim()].filter(Boolean).join(", ");
}

export const IDENTITY_RULES =
  "Preserve the person's identity exactly: same face shape and facial features, eye color, skin tone, freckles, moles or marks, " +
  "hair color, hair texture and length, body proportions and apparent age. Do not beautify, slim, smooth skin, whiten teeth, " +
  "add makeup, or make them look older or younger. This preview must look like the real person.";

const STYLE_RULES =
  "Lighting and style: soft, flattering key light with gentle fill, catchlights in the eyes, 85mm portrait lens, shallow depth of field, " +
  "natural skin texture with no heavy retouching, true-to-life clothing color and fabric texture, realistic folds and drape, " +
  "like a working industry headshot photographer. Wardrobe must be modest and age-appropriate. " +
  "Output a single photo of one person. No text, captions, borders, collage, or watermark.";

/**
 * Builds the image prompt and the ordered list of reference images that goes
 * with it. Image numbering in the prompt matches the order of `images`.
 */
export function buildImagePrompt(req: GenerateRequest): { prompt: string; images: string[] } {
  const images: string[] = [];
  const actorPhotos = req.actor.photos.slice(0, 3);
  actorPhotos.forEach((p) => images.push(p));
  const actorRefs = actorPhotos.length === 1 ? "reference image 1" : `reference images 1–${actorPhotos.length}`;
  const age = req.actor.ageRange?.trim();
  const ageText = age ? ` They are an actor in the ${age} age range; keep their real apparent age.` : "";

  const garments = [...req.look.garments].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const wardrobeLines = garments.map((g) => garmentLine(g, images));

  const wardrobe = wardrobeLines.length
    ? `Dress them in this outfit, layered from the inside out:\n${wardrobeLines.join("\n")}\n` +
      "Replace whatever they are wearing in the reference photo with exactly this outfit — nothing more, nothing less. " +
      "Layers must sit realistically on top of each other (collars, cuffs and hems of inner layers visible where they naturally would be). " +
      "No logos or text on clothing unless shown in a reference photo."
    : "Keep the clothing they are wearing in the reference photo.";

  const hair = req.look.hair?.trim()
    ? `Hair: ${req.look.hair.trim()} — but keep their real hair color, texture and length.`
    : "Hair: keep exactly as in the reference photo.";

  const b = req.look.backdrop;
  const prompt = [
    `Create a professional, photorealistic acting headshot of the person in ${actorRefs}.`,
    IDENTITY_RULES + ageText,
    "",
    wardrobe,
    "",
    hair,
    `Expression: ${req.look.expression || "keep the same expression as the reference photo"}.`,
    `Framing: ${FRAMING_TEXT[req.look.framing] ?? FRAMING_TEXT.chest}. Facing the camera, shoulders slightly angled.`,
    `Background: ${b.style || "seamless studio backdrop"} in ${b.colorName || "medium gray"} (${b.colorHex || "#9aa0a6"}), softly out of focus.`,
    STYLE_RULES,
  ].join("\n");

  return { prompt, images };
}

function garmentLine(g: GenerateGarment, images: string[]): string {
  const label = describeGarment({
    garment: g.garment,
    colorName: g.colorName ?? "",
    neckline: g.neckline ?? "",
    fabric: g.fabric ?? "",
    fit: g.fit ?? "",
    details: g.details ?? "",
  }) || "garment";
  let line = `- ${ROLE_TEXT[g.role]}: ${label}.`;
  if (g.image) {
    images.push(g.image);
    const n = images.length;
    line += g.isGroupPhoto
      ? ` Reference image ${n} shows several clothing items; use ONLY the ${g.garment || "described item"}${g.location ? ` (${g.location})` : ""}. Match its exact color, fabric, texture, pattern, neckline and fit.`
      : ` Match the garment in reference image ${n} exactly: color, fabric, texture, pattern, neckline and fit.`;
  }
  return line;
}

export function buildEditPrompt(req: EditRequest): { prompt: string; images: string[] } {
  const images = [req.image];
  const lines = [
    "Reference image 1 is a headshot preview. Edit it according to this instruction:",
    `"${req.instruction.trim()}"`,
    "",
    "Change ONLY what the instruction asks for. Keep everything else identical: the same person, pose, framing, camera angle, " +
      "lighting, background, hair, expression and every other piece of clothing, unless the instruction says otherwise.",
  ];
  if (req.actorPhoto) {
    images.push(req.actorPhoto);
    lines.push(`Reference image ${images.length} is a real photo of the same person — use it to keep their identity accurate.`);
  }
  if (req.garmentImage) {
    images.push(req.garmentImage);
    lines.push(
      `Reference image ${images.length} shows the garment the instruction refers to — match its exact color, fabric, texture, pattern and neckline.`,
    );
  }
  lines.push("", IDENTITY_RULES, STYLE_RULES);
  return { prompt: lines.join("\n"), images };
}

export function collectFreeText(req: GenerateRequest): string {
  return [
    req.look.hair,
    req.look.expression,
    req.look.backdrop.style,
    req.look.backdrop.colorName,
    ...req.look.garments.flatMap((g) => [g.garment, g.colorName, g.neckline, g.fabric, g.fit, g.details, g.location]),
  ]
    .filter(Boolean)
    .join(" \n ");
}
