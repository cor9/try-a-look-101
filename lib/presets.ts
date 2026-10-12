import type { Backdrop, CastingType, Framing } from "./types";

const studio = (colorName: string, colorHex: string): Backdrop => ({
  colorName,
  colorHex,
  style: "seamless studio backdrop",
});

// Casting types describe the kind of *role* a look is aimed at — not who the
// actor is. Any actor can try any type; the wardrobe just helps tell the story.
export const CASTING_TYPES: CastingType[] = [
  {
    key: "next-door",
    title: "Girl / Boy Next Door",
    blurb: "Warm, relatable, genuine — family stories, school, coming-of-age.",
    wardrobe: "Simple everyday pieces in soft solids or a small print. Nothing that looks like a costume.",
    expression: "warm, genuine closed-mouth smile",
    backdrop: { colorName: "soft green", colorHex: "#9fb38a", style: "natural outdoor light, gently blurred greenery" },
    ideas: {
      base: ["soft blue henley", "lavender ribbed knit top", "sage floral blouse", "heather gray crewneck tee"],
      second: ["cream open cardigan", "light denim shirt, unbuttoned"],
      outer: ["light-wash denim jacket"],
      accessory: ["simple headband", "small pendant necklace"],
    },
    palette: ["#b6a3e0", "#efe8d8", "#203f7a", "#7f9a3c", "#e8a5a5"],
  },
  {
    key: "comedic",
    title: "Comedic Best Friend",
    blurb: "Playful, quick, full of personality — sidekicks and scene-stealers.",
    wardrobe: "Brighter colors and one fun piece (overalls, a graphic-free bold tee, a cheerful layer).",
    expression: "big genuine smile, playful and a little mischievous",
    backdrop: studio("light blue", "#a9c6e8"),
    ideas: {
      base: ["bright red tee", "mustard yellow tee", "kelly green tee"],
      second: ["denim overalls", "colorful plaid flannel, open"],
      outer: ["zip hoodie in a bright color"],
      accessory: ["knit beanie", "colorful headband"],
    },
    palette: ["#d23a3a", "#3e6fae", "#e8b730", "#e9b4b0", "#7c8a4c"],
  },
  {
    key: "popular",
    title: "Popular Kid",
    blurb: "Confident and current — the one everyone notices walking in.",
    wardrobe: "On-trend but not logo-heavy. Clean lines, a polished layer, one standout color.",
    expression: "confident, easy smile",
    backdrop: studio("warm white", "#efe9df"),
    ideas: {
      base: ["fitted white crewneck tee", "cropped knit top in a jewel tone", "crisp collared polo"],
      second: ["cropped cardigan", "varsity-style knit"],
      outer: ["cropped denim jacket", "bomber jacket"],
      accessory: ["delicate layered necklaces", "claw clip"],
    },
    palette: ["#f2e9dc", "#c23b5b", "#1f2a44", "#d6b37a", "#5b7f95"],
  },
  {
    key: "tough",
    title: "Tough Kid",
    blurb: "Street-smart, guarded, determined — leaders and kids who always have a plan.",
    wardrobe: "Darker, layered, casual. Hoodie under a jacket, denim or faux leather, muted tones.",
    expression: "serious and confident, a slight challenge in the eyes, no smile",
    backdrop: { colorName: "charcoal", colorHex: "#3b3d40", style: "moody urban backdrop with soft falloff" },
    ideas: {
      base: ["black crewneck tee", "charcoal hoodie"],
      second: ["dark flannel, open"],
      outer: ["black faux-leather jacket", "olive utility jacket", "dark denim jacket"],
      accessory: ["simple chain necklace"],
    },
    palette: ["#151515", "#6f6f6f", "#6a1a2a", "#4e6a52", "#4a2c1d"],
  },
  {
    key: "athletic",
    title: "Athletic",
    blurb: "Energetic, capable, team-minded — sports stories and active brands.",
    wardrobe: "Clean athletic pieces in solid colors: quarter-zips, performance tees, track jackets. No visible logos.",
    expression: "bright, energetic smile",
    backdrop: studio("cool gray", "#b8bec6"),
    ideas: {
      base: ["solid performance tee", "fitted athletic tank under a layer"],
      second: ["quarter-zip pullover"],
      outer: ["track jacket", "lightweight windbreaker"],
      accessory: ["sports headband", "baseball cap (no logo)"],
    },
    palette: ["#1d4ed8", "#e11d48", "#f4f4f5", "#16a34a", "#0f172a"],
  },
  {
    key: "academic",
    title: "Academic / Intellectual",
    blurb: "Curious, thoughtful, clever — the smart kid, the inventor, the debate captain.",
    wardrobe: "Collars, cardigans and knits. Classic, a little preppy, quietly put-together.",
    expression: "thoughtful, kind half-smile",
    backdrop: studio("warm tan", "#cdb59a"),
    ideas: {
      base: ["collared button-down shirt", "striped long-sleeve tee", "fine-knit polo"],
      second: ["V-neck sweater vest", "button cardigan"],
      outer: ["corduroy jacket"],
      accessory: ["glasses", "simple watch"],
    },
    palette: ["#24324f", "#7a2e2e", "#d9c7a7", "#55602a", "#6b4f3a"],
  },
  {
    key: "quirky",
    title: "Quirky Character",
    blurb: "Offbeat, imaginative, one-of-a-kind — the artist, the oddball, the scene-stealer.",
    wardrobe: "One unexpected element: a pattern, vintage piece or bold accessory. Keep the rest simple.",
    expression: "curious, slightly lopsided smile",
    backdrop: studio("mustard", "#d9b44a"),
    ideas: {
      base: ["patterned button-up", "vintage-style striped tee"],
      second: ["chunky knit cardigan in an unexpected color"],
      outer: ["corduroy overall dress", "patchwork denim jacket"],
      accessory: ["round glasses", "bucket hat", "funky earrings"],
    },
    palette: ["#d9b44a", "#2e6f6f", "#c2553d", "#8a5fbf", "#f0e6d2"],
  },
  {
    key: "dramatic-lead",
    title: "Dramatic Lead",
    blurb: "Grounded, emotionally open — the heart of the story.",
    wardrobe: "Rich solid colors and textured knits that draw focus to the eyes.",
    expression: "soft, open expression with a hint of a smile — emotion in the eyes",
    backdrop: studio("deep blue-gray", "#4a5568"),
    ideas: {
      base: ["burgundy ribbed sweater", "deep teal henley", "forest green crewneck sweater"],
      second: ["oatmeal open cardigan"],
      outer: ["navy peacoat"],
      accessory: [],
    },
    palette: ["#6a1f2f", "#0f5a63", "#1f4b33", "#2b2f45", "#c8b8a0"],
  },
  {
    key: "driven",
    title: "Aspirational / Driven",
    blurb: "Bright, polished, ambitious — high achievers and inspirational stories.",
    wardrobe: "Clean, classic, polished. A crisp layer over a solid.",
    expression: "confident, kind, knowing half-smile",
    backdrop: studio("warm neutral", "#d8cbb8"),
    ideas: {
      base: ["cream knit top", "solid jewel-tone tee"],
      second: ["fitted blazer-style cardigan"],
      outer: ["olive utility jacket", "tailored jean jacket"],
      accessory: ["small stud earrings"],
    },
    palette: ["#0f4d3a", "#f4ecd9", "#d9a86a", "#16213e", "#55602a"],
  },
  {
    key: "serious",
    title: "Serious / Intense",
    blurb: "Still, focused, complex — thrillers, period drama, roles with weight.",
    wardrobe: "Simple, neutral, timeless. Nothing that pulls focus from the face.",
    expression: "serious, vulnerable, thoughtful — no smile",
    backdrop: { colorName: "charcoal", colorHex: "#2e2f33", style: "dark, moody backdrop with soft side light" },
    ideas: {
      base: ["black fine-knit sweater", "charcoal crewneck", "navy henley"],
      second: [],
      outer: ["dark wool jacket"],
      accessory: [],
    },
    palette: ["#1f1f1f", "#24324f", "#efe6d6", "#3d2a20", "#4f4a24"],
  },
];

export const BACKDROP_SWATCHES: Backdrop[] = [
  studio("medium gray", "#9aa0a6"),
  studio("light gray", "#d6d8db"),
  studio("warm white", "#efe9df"),
  studio("light blue", "#a9c6e8"),
  studio("warm tan", "#cdb59a"),
  studio("sage", "#a7b59a"),
  studio("charcoal", "#3b3d40"),
  { colorName: "soft green", colorHex: "#9fb38a", style: "natural outdoor light, gently blurred greenery" },
  { colorName: "brick", colorHex: "#8a4b3c", style: "softly blurred urban brick wall" },
];

export const BACKDROP_STYLES = [
  "seamless studio backdrop",
  "natural outdoor light, gently blurred greenery",
  "softly blurred urban brick wall",
  "moody urban backdrop with soft falloff",
  "dark, moody backdrop with soft side light",
];

export const EXPRESSION_OPTIONS = [
  "keep the same expression as the reference photo",
  "warm, genuine closed-mouth smile",
  "warm, open smile showing teeth",
  "big genuine smile, playful and a little mischievous",
  "confident, kind, knowing half-smile",
  "serious and confident, no smile",
  "serious, vulnerable, thoughtful — no smile",
];

export const NECKLINES = ["crew neck", "V-neck", "scoop neck", "henley placket", "collared", "mock neck", "square neck", "hooded"];
export const FABRICS = ["cotton jersey", "ribbed knit", "waffle knit", "cable knit", "chunky knit", "denim", "corduroy", "flannel", "fleece", "linen", "faux leather", "crochet"];
export const FITS = ["fitted", "relaxed", "oversized", "cropped", "tailored"];

export const COLOR_SWATCHES: { name: string; hex: string }[] = [
  { name: "deep teal", hex: "#0f5a63" },
  { name: "cobalt blue", hex: "#1f4fd1" },
  { name: "navy", hex: "#1c2a4a" },
  { name: "soft blue", hex: "#7fa6d9" },
  { name: "forest green", hex: "#1f4b33" },
  { name: "sage", hex: "#9caf88" },
  { name: "olive", hex: "#5d6236" },
  { name: "mustard", hex: "#d9a020" },
  { name: "rust", hex: "#a84f2c" },
  { name: "burgundy", hex: "#6a1f2f" },
  { name: "berry", hex: "#8e2449" },
  { name: "dusty rose", hex: "#c98f8f" },
  { name: "lavender", hex: "#b6a3e0" },
  { name: "cream", hex: "#efe6d2" },
  { name: "white", hex: "#f7f7f5" },
  { name: "heather gray", hex: "#a3a6aa" },
  { name: "charcoal", hex: "#3b3d40" },
  { name: "black", hex: "#141414" },
  { name: "chocolate brown", hex: "#4a2c1d" },
  { name: "light-wash denim", hex: "#8fb0d3" },
];

export const QUICK_EDITS = [
  "Remove the outer layer",
  "Change the base layer to forest green",
  "Make the smile warmer and more natural",
  "Make the background medium gray",
  "Button up the second layer",
  "Remove the accessories",
];

export const DEFAULT_FRAMING: Framing = "chest";

export function allCastingTypes(custom: CastingType[] = []): CastingType[] {
  return [...CASTING_TYPES, ...custom];
}

export function findCastingType(key: string, custom: CastingType[] = []): CastingType | undefined {
  return allCastingTypes(custom).find((t) => t.key === key);
}
