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

/** A reference image plus the role it plays, stated next to the image itself. */
export interface RefImage {
  url: string;
  label: string;
}

export const IDENTITY_RULES =
  "The face and head must stay the actor's own: same face shape, facial features, eye shape and color, nose, mouth, ears, " +
  "skin tone and texture, freckles, moles or marks, hairline, hair color, hair texture and length, body build and apparent age. " +
  "Do not beautify, slim, smooth skin, whiten teeth, add makeup, or make them look older or younger. " +
  "Anyone who knows the actor must instantly recognize them.";

const GARMENT_ONLY =
  "Clothing reference photos are for the garment ONLY. If a person, model or mannequin appears in one, ignore them completely — " +
  "never copy their face, head, hair, skin or body.";

const STYLE_RULES =
  "Style: soft, flattering studio light, natural skin texture with no heavy retouching, true-to-life clothing color and fabric texture, " +
  "realistic folds and drape — like a working industry headshot photographer. Wardrobe must be modest and age-appropriate. " +
  "Output a single photo of one person. No text, captions, borders, collage, or watermark.";

/**
 * Builds the image prompt and the ordered, labeled reference images that go
 * with it. The first image is always the actor's main photo: the model edits
 * that photo rather than inventing a new person.
 */
export function buildImagePrompt(req: GenerateRequest): { prompt: string; images: RefImage[] } {
  const images: RefImage[] = [];
  const actorPhotos = req.actor.photos.slice(0, 3);
  actorPhotos.forEach((url, i) =>
    images.push({
      url,
      label:
        i === 0
          ? "Image 1 — THE ACTOR (main photo). This is the person who must appear in the result. Edit this photo."
          : `Image ${i + 1} — THE SAME ACTOR from another angle. Use it only to keep their face and hair accurate.`,
    }),
  );
  const actorRefs = actorPhotos.length === 1 ? "image 1" : `images 1–${actorPhotos.length}`;
  const age = req.actor.ageRange?.trim();
  const ageText = age ? ` They are an actor in the ${age} age range; keep their real apparent age.` : "";

  const garments = [...req.look.garments].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const wardrobeLines = garments.map((g) => garmentLine(g, images));
  const hasGarmentPhotos = images.length > actorPhotos.length;

  const wardrobe = wardrobeLines.length
    ? `Change ONLY their clothing to this outfit, layered from the inside out:\n${wardrobeLines.join("\n")}\n` +
      "Replace what they wear in image 1 with exactly this outfit — nothing more, nothing less. " +
      "Layers must sit realistically on top of each other (collars, cuffs and hems of inner layers visible where they naturally would be). " +
      "No logos or text on clothing unless shown in a reference photo."
    : "Keep the clothing they are wearing in image 1.";

  const hair = req.look.hair?.trim()
    ? `Hair: ${req.look.hair.trim()} — but keep their real hair color, texture and length.`
    : "Hair: keep exactly as in image 1.";

  const b = req.look.backdrop;
  const prompt = [
    `Edit the photo of the actor in image 1 into a professional acting headshot. Keep the same real person from ${actorRefs} — this is a wardrobe preview, not a new character.`,
    IDENTITY_RULES + ageText,
    hasGarmentPhotos ? GARMENT_ONLY : "",
    "",
    wardrobe,
    "",
    hair,
    req.faceLock
      ? "Expression and head angle: keep exactly the same facial expression, head tilt and face angle as in image 1."
      : `Expression: ${req.look.expression || "keep the same expression as in image 1"}.`,
    `Framing: ${FRAMING_TEXT[req.look.framing] ?? FRAMING_TEXT.chest}. Facing the camera, shoulders slightly angled.`,
    `Background: ${b.style || "seamless studio backdrop"} in ${b.colorName || "medium gray"} (${b.colorHex || "#9aa0a6"}), softly out of focus.`,
    STYLE_RULES,
    "",
    "Final check before you answer: the face must be the actor from image 1 — not a similar-looking stranger, and not anyone from a clothing photo.",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  return { prompt, images };
}

function garmentLine(g: GenerateGarment, images: RefImage[]): string {
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
    const n = images.length + 1;
    const which = g.isGroupPhoto
      ? `It shows several items; use ONLY the ${g.garment || "described item"}${g.location ? ` (${g.location})` : ""}.`
      : "";
    images.push({
      url: g.image,
      label: `Image ${n} — CLOTHING REFERENCE ONLY (${ROLE_TEXT[g.role].split(" (")[0].toLowerCase()}: ${label}). ${which} Ignore any person or mannequin in this photo.`.replace(/\s+/g, " "),
    });
    line += ` Match the garment in image ${n} exactly: color, fabric, texture, pattern, neckline and fit.${which ? ` ${which}` : ""}`;
  }
  return line;
}

export function buildEditPrompt(req: EditRequest): { prompt: string; images: RefImage[] } {
  const images: RefImage[] = [{ url: req.image, label: "Image 1 — THE PREVIEW TO EDIT. Keep this person, pose and photo; change only what is asked." }];
  const lines = [
    "Edit image 1 according to this instruction:",
    `"${req.instruction.trim()}"`,
    "",
    "Change ONLY what the instruction asks for. Keep everything else identical: the same person, face, pose, framing, camera angle, " +
      "lighting, background, hair, expression and every other piece of clothing, unless the instruction says otherwise.",
  ];
  if (req.actorPhoto) {
    images.push({ url: req.actorPhoto, label: `Image ${images.length + 1} — THE ACTOR's real photo. Use it to keep their face accurate.` });
    lines.push(`Image ${images.length} is a real photo of the same actor — if the face in image 1 has drifted, bring it back to match this person.`);
  }
  if (req.garmentImage) {
    images.push({
      url: req.garmentImage,
      label: `Image ${images.length + 1} — CLOTHING REFERENCE ONLY. Ignore any person or mannequin in this photo.`,
    });
    lines.push(`Image ${images.length} shows the garment the instruction refers to — match its exact color, fabric, texture, pattern and neckline.`);
    lines.push(GARMENT_ONLY);
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
