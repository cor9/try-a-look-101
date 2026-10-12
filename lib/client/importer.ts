"use client";

import { COLOR_SWATCHES } from "@/lib/presets";
import type { ItemCategory } from "@/lib/types";

// Turns whatever the user hands us — photos picked from an album, a folder,
// a .zip, or a drag-and-drop of any mix — into a flat list of image files.

export const MAX_IMPORT = 80;

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i;
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

function isJunk(path: string): boolean {
  return path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
}

export function isImageFile(f: File): boolean {
  return !isJunk(f.name) && (f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
}

function isZip(f: File): boolean {
  return /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";
}

async function unzipImages(zip: File): Promise<File[]> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await zip.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, { filter: (e) => !isJunk(e.name) && IMAGE_EXT.test(e.name) }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  return Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([path, bytes]) => {
      const name = path.split("/").pop() || path;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const copy = new Uint8Array(bytes); // detach from fflate's buffer
      return new File([copy], name, { type: MIME_BY_EXT[ext] ?? "" });
    });
}

/** Expand zips and drop anything that isn't an image. */
export async function expandFiles(files: File[]): Promise<{ images: File[]; skipped: number }> {
  const images: File[] = [];
  let skipped = 0;
  for (const f of files) {
    if (isZip(f)) {
      try {
        images.push(...(await unzipImages(f)));
      } catch {
        skipped++;
      }
    } else if (isImageFile(f)) {
      images.push(f);
    } else {
      skipped++;
    }
  }
  return { images, skipped };
}

// ---- drag & drop of folders (Chrome, Edge, Safari, Firefox all support webkitGetAsEntry)

async function walk(entry: FileSystemEntry, out: File[]) {
  if (entry.name.startsWith(".") || entry.name === "__MACOSX") return;
  if (entry.isFile) {
    out.push(await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail)));
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in chunks; keep reading until it comes back empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  // Grab entries synchronously — the DataTransfer is emptied once the drop handler yields.
  const entries = Array.from(dt.items ?? [])
    .map((i) => i.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null);
  if (!entries.length) return Array.from(dt.files);
  const out: File[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}

// ---- offline helpers for when no scanner is configured (or a scan fails)

/** Average color of the middle of the photo, ignoring near-white/near-black background. */
export async function guessColor(blob: Blob): Promise<{ hex: string; name: string }> {
  const bmp = await createImageBitmap(blob);
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, bmp.width * 0.25, bmp.height * 0.25, bmp.width * 0.5, bmp.height * 0.5, 0, 0, size, size);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
    if (Math.min(pr, pg, pb) > 232) continue; // white seamless / bedsheet
    r += pr;
    g += pg;
    b += pb;
    n++;
  }
  if (!n) return { hex: "#f7f7f5", name: "white" };
  const hex = `#${[r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  return { hex, name: nearestColorName(hex) };
}

export function nearestColorName(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = COLOR_SWATCHES[0];
  let bestD = Infinity;
  for (const s of COLOR_SWATCHES) {
    const [sr, sg, sb] = rgb(s.hex);
    const d = (r - sr) ** 2 * 0.3 + (g - sg) ** 2 * 0.59 + (b - sb) ** 2 * 0.11;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best.name;
}

/** "blue-henley_2.jpg" → "Blue Henley 2"; camera names like IMG_1234 → "". */
export function nameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  if (/^(img|dsc|dscn|pxl|photo|image|screenshot|screen shot|mvimg|dji)[\s_-]?\d/i.test(base) || /^[0-9a-f-]{16,}$/i.test(base) || /^\d+$/.test(base)) {
    return "";
  }
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

const CATEGORY_WORDS: [RegExp, ItemCategory][] = [
  [/\b(hat|beanie|cap|headband|beret|bandana)\b/i, "headwear"],
  [/\b(glasses|sunglasses|specs)\b/i, "glasses"],
  [/\b(necklace|earrings?|bracelet|pendant|chain)\b/i, "jewelry"],
  [/\b(jacket|hoodie|coat|blazer|vest|windbreaker|parka)\b/i, "outerwear"],
  [/\b(cardigan|flannel|overshirt|shacket|button[- ]?(up|down))\b/i, "layer"],
  [/\b(dress|overalls|romper|jumpsuit)\b/i, "dress"],
  [/\b(scarf|tie|bow|suspenders)\b/i, "accessory"],
];

/** Best guess at a category from words in a filename, e.g. "denim-jacket.jpg" → outerwear. */
export function categoryFromName(name: string): ItemCategory {
  return CATEGORY_WORDS.find(([re]) => re.test(name.replace(/[_-]+/g, " ")))?.[1] ?? "top";
}

const CATEGORY_NOUN: Record<ItemCategory, string> = {
  top: "top",
  layer: "layer",
  outerwear: "jacket",
  dress: "dress",
  headwear: "hat",
  accessory: "accessory",
  jewelry: "jewelry",
  glasses: "glasses",
};

/** Readable default name when nothing better is known, e.g. "Mustard hat". */
export function defaultItemName(colorName: string, category: ItemCategory): string {
  const text = `${colorName} ${CATEGORY_NOUN[category]}`.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
