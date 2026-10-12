import type { Look, Project } from "@/lib/types";
import { garmentLabel } from "./factory";

export interface PackItem {
  key: string;
  label: string;
  looks: number[];
}

/** Every distinct garment used by the looks in the session plan, in plan order. */
export function packingList(project: Project): PackItem[] {
  const out = new Map<string, PackItem>();
  const looks = project.plan.lookIds.map((id) => project.looks.find((l) => l.id === id)).filter((l): l is Look => Boolean(l));
  looks.forEach((look, i) => {
    for (const slot of look.layers) {
      const item = slot.itemId ? project.closet.find((c) => c.id === slot.itemId) : undefined;
      const label = item ? garmentLabel({ colorName: item.colorName, garment: item.name }) : garmentLabel(slot);
      if (!label.trim()) continue;
      const key = item ? `item:${item.id}` : `text:${label.toLowerCase().trim()}`;
      const existing = out.get(key);
      if (existing) {
        if (!existing.looks.includes(i + 1)) existing.looks.push(i + 1);
      } else {
        out.set(key, { key, label, looks: [i + 1] });
      }
    }
  });
  return Array.from(out.values());
}
