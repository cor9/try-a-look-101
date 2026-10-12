import { CASTING_TYPES, DEFAULT_FRAMING, findCastingType } from "@/lib/presets";
import { describeGarment } from "@/lib/prompt";
import {
  CONSENT_VERSION,
  type CastingType,
  type ClosetItem,
  type Consent,
  type LayerRole,
  type LayerSlot,
  type Look,
  type Project,
} from "@/lib/types";
import { uid } from "./id";

export function newProject(name: string, consent: Omit<Consent, "version">): Project {
  const now = Date.now();
  return {
    id: uid("prj"),
    name,
    consent: { ...consent, version: CONSENT_VERSION },
    actor: { name: "", ageRange: "", castingTypes: [], notes: "", photoIds: [] },
    customCastingTypes: [],
    closet: [],
    looks: [],
    plan: { lookIds: [], lookNotes: {}, prepNotes: "", sessionDate: "", photographer: "", packed: {} },
    spend: { images: 0, usd: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export function emptySlot(role: LayerRole, from?: Partial<LayerSlot>): LayerSlot {
  return {
    id: uid("slot"),
    role,
    garment: "",
    colorName: "",
    neckline: "",
    fabric: "",
    fit: "",
    details: "",
    ...from,
  };
}

export function slotFromItem(role: LayerRole, item: ClosetItem): LayerSlot {
  return emptySlot(role, {
    itemId: item.id,
    garment: item.name,
    colorName: item.colorName,
    colorHex: item.colorHex,
    details: item.description,
  });
}

export function newLook(castingTypeKey: string, custom: CastingType[], existing: Look[]): Look {
  const type = findCastingType(castingTypeKey, custom) ?? CASTING_TYPES[0];
  const same = existing.filter((l) => l.castingType === type.key).length;
  return {
    id: uid("look"),
    title: same ? `${type.title} ${same + 1}` : type.title,
    castingType: type.key,
    layers: [emptySlot("base")],
    hair: "",
    expression: type.expression,
    backdrop: { ...type.backdrop },
    framing: DEFAULT_FRAMING,
    notes: "",
    renders: [],
    favorite: false,
    createdAt: Date.now(),
  };
}

export function lookSummary(look: Look): string {
  const order: LayerRole[] = ["base", "second", "outer", "accessory"];
  return (
    [...look.layers]
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
      .map((s) => describeGarment(s))
      .filter(Boolean)
      .join(" + ") || "Wardrobe from reference photo"
  );
}

/** Short label for a garment, used in the session plan and packing list. */
export function garmentLabel(slot: Pick<LayerSlot, "colorName" | "garment">): string {
  return describeGarment({ garment: slot.garment, colorName: slot.colorName, neckline: "", fabric: "", fit: "", details: "" });
}
