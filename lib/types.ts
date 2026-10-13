// Shared data model for Try A Look. Everything here is plain JSON so it can be
// stored in IndexedDB on the client and sent over the wire to the API routes.

export type ItemCategory =
  | "top"
  | "layer"
  | "outerwear"
  | "dress"
  | "headwear"
  | "accessory"
  | "jewelry"
  | "glasses";

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  top: "Top / tee",
  layer: "Cardigan / overshirt",
  outerwear: "Jacket / hoodie",
  dress: "Dress / one-piece",
  headwear: "Hat / headband",
  accessory: "Accessory",
  jewelry: "Jewelry",
  glasses: "Glasses",
};

export type LayerRole = "base" | "second" | "outer" | "accessory";

export const ROLES: LayerRole[] = ["base", "second", "outer", "accessory"];

export const ROLE_LABELS: Record<LayerRole, string> = {
  base: "Base layer",
  second: "Second layer",
  outer: "Outerwear",
  accessory: "Accessories",
};

export const ROLE_HINTS: Record<LayerRole, string> = {
  base: "The tee, henley, knit or blouse closest to the body.",
  second: "An open cardigan, overshirt or flannel over the base.",
  outer: "Jacket, hoodie, denim or vest — the top layer.",
  accessory: "Hat, headband, glasses, necklace — keep it simple.",
};

export function defaultRoleFor(category: ItemCategory): LayerRole {
  if (category === "top" || category === "dress") return "base";
  if (category === "layer") return "second";
  if (category === "outerwear") return "outer";
  return "accessory";
}

export interface ClosetItem {
  id: string;
  name: string;
  category: ItemCategory;
  colorName: string;
  colorHex: string;
  description: string;
  /** Blob id of the (cropped) item photo, if any. */
  photoId?: string;
  /** Blob id of the full group/rack photo this item was scanned from. */
  sourcePhotoId?: string;
  /** Where the item sits in the source photo, e.g. "center, olive button-up". */
  location?: string;
  /** When true, send the full source photo (plus location) instead of the crop. */
  useSourcePhoto?: boolean;
  createdAt: number;
}

/** One wardrobe component in a look. */
export interface LayerSlot {
  id: string;
  role: LayerRole;
  /** Inventory item reference (may carry a photo). */
  itemId?: string;
  /** What the garment is, e.g. "henley", "denim jacket". */
  garment: string;
  colorName: string;
  colorHex?: string;
  neckline: string;
  fabric: string;
  fit: string;
  /** Anything else: "sleeves pushed up", "unbuttoned". */
  details: string;
}

export interface Render {
  id: string;
  imageId: string;
  createdAt: number;
  provider: string;
  model: string;
  kind: "generate" | "edit";
  /** For edits: the plain-English instruction. */
  instruction?: string;
  parentId?: string;
  /** Outfit summary at the time the image was made. */
  summary: string;
  /** True when Face Lock put the actor's real face onto this preview. */
  faceLocked?: boolean;
  /** Why Face Lock couldn't run, when it was on. */
  faceLockNote?: string;
}

export type Framing = "tight" | "chest" | "waist";

export const FRAMING_LABELS: Record<Framing, string> = {
  tight: "Tight (shoulders)",
  chest: "Classic (chest up)",
  waist: "Three-quarter (waist up)",
};

export interface Backdrop {
  colorName: string;
  colorHex: string;
  style: string;
}

export interface Look {
  id: string;
  title: string;
  castingType: string;
  layers: LayerSlot[];
  hair: string;
  expression: string;
  backdrop: Backdrop;
  framing: Framing;
  notes: string;
  renders: Render[];
  selectedRenderId?: string;
  favorite: boolean;
  createdAt: number;
}

export interface CastingType {
  key: string;
  title: string;
  blurb: string;
  wardrobe: string;
  expression: string;
  backdrop: Backdrop;
  ideas: Partial<Record<LayerRole, string[]>>;
  palette: string[];
  custom?: boolean;
}

export interface Actor {
  name: string;
  ageRange: string;
  castingTypes: string[];
  notes: string;
  photoIds: string[];
}

export interface Consent {
  acceptedAt: number;
  version: number;
  role: "guardian" | "adult-actor";
}

export interface SessionPlan {
  lookIds: string[];
  lookNotes: Record<string, string>;
  prepNotes: string;
  sessionDate: string;
  photographer: string;
  packed: Record<string, boolean>;
}

export interface Project {
  id: string;
  name: string;
  consent: Consent;
  actor: Actor;
  customCastingTypes: CastingType[];
  closet: ClosetItem[];
  looks: Look[];
  plan: SessionPlan;
  spend: { images: number; usd: number };
  createdAt: number;
  updatedAt: number;
}

export const CONSENT_VERSION = 1;

export const AGE_RANGES = [
  "3–5",
  "6–8",
  "9–11",
  "12–14",
  "15–17",
  "18+ (plays younger)",
  "Adult",
];

// ---------- API payloads ----------

export interface GenerateGarment {
  role: LayerRole;
  garment: string;
  colorName?: string;
  neckline?: string;
  fabric?: string;
  fit?: string;
  details?: string;
  /** data: URL (jpeg/png/webp) of a reference photo. */
  image?: string;
  /** True when `image` shows several garments and `location` says which one. */
  isGroupPhoto?: boolean;
  location?: string;
}

export interface GenerateRequest {
  actor: {
    ageRange?: string;
    /** data: URLs, 1-3 photos of the actor. */
    photos: string[];
  };
  look: {
    hair: string;
    expression: string;
    backdrop: Backdrop;
    framing: Framing;
    garments: GenerateGarment[];
  };
  variations: number;
  engine?: "openai" | "gemini";
  /** Face Lock is on: ask the model to keep the photo's expression and head angle so the real face fits. */
  faceLock?: boolean;
}

export interface EditRequest {
  /** data: URL of the preview being edited. */
  image: string;
  /** data: URL of an actor photo to re-anchor identity. */
  actorPhoto?: string;
  instruction: string;
  /** Optional garment photo the instruction refers to ("swap the jacket for this one"). */
  garmentImage?: string;
  engine?: "openai" | "gemini";
}

export interface ImageResponse {
  images: string[]; // data: URLs
  provider: string;
  model: string;
  estimatedCostUsd: number;
}

export interface ScannedItem {
  name: string;
  category: ItemCategory;
  colorName: string;
  colorHex: string;
  description: string;
  location: string;
  box: { x: number; y: number; width: number; height: number };
}

export interface AppConfig {
  imageProvider: "openai" | "gemini" | null;
  imageModel: string | null;
  /** Every engine with a key configured; the user can pick between them. */
  imageProviders: ("openai" | "gemini")[];
  scannerEnabled: boolean;
  accessCodeRequired: boolean;
  limits: { perHour: number; perDay: number };
}
