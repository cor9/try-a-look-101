"use client";

// Browser-side image prep: decode (including iPhone HEIC), shrink, crop, stamp.

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const isHeic = /heic|heif/i.test(file.type) || (file instanceof File && /\.(heic|heif)$/i.test(file.name));
    if (!isHeic) throw new Error("That file isn't an image we can read. Try a JPG or PNG.");
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return createImageBitmap(Array.isArray(converted) ? converted[0] : converted);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), "image/jpeg", quality),
  );
}

function draw(bitmap: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decode any photo and re-encode as a JPEG no larger than `maxEdge` px. Strips EXIF/GPS. */
export async function normalizePhoto(file: Blob, maxEdge = 1280): Promise<Blob> {
  const bmp = await decode(file);
  const blob = await canvasToBlob(draw(bmp, 0, 0, bmp.width, bmp.height, maxEdge));
  bmp.close();
  return blob;
}

/** Crop a normalized box (0-1 fractions) out of an image, with some padding. */
export async function cropPhoto(
  file: Blob,
  box: { x: number; y: number; width: number; height: number },
  pad = 0.06,
  maxEdge = 1024,
): Promise<Blob> {
  const bmp = await decode(file);
  const x0 = Math.max(0, box.x - pad) * bmp.width;
  const y0 = Math.max(0, box.y - pad) * bmp.height;
  const x1 = Math.min(1, box.x + box.width + pad) * bmp.width;
  const y1 = Math.min(1, box.y + box.height + pad) * bmp.height;
  const canvas = draw(bmp, x0, y0, Math.max(8, x1 - x0), Math.max(8, y1 - y0), maxEdge);
  bmp.close();
  return canvasToBlob(canvas);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** JPEG data URL sized for an API request (keeps payloads well under hosting limits). */
export async function toRequestDataUrl(blob: Blob, maxEdge = 1024): Promise<string> {
  return blobToDataUrl(await normalizePhoto(blob, maxEdge));
}

/** Adds the "AI wardrobe simulation" label to an image for downloads and exports. */
export async function stampSimulation(blob: Blob, caption?: string): Promise<Blob> {
  const bmp = await decode(blob);
  const canvas = draw(bmp, 0, 0, bmp.width, bmp.height, 2048);
  bmp.close();
  const ctx = canvas.getContext("2d")!;
  const h = Math.round(canvas.height * 0.055);
  ctx.fillStyle = "rgba(20, 28, 54, 0.78)";
  ctx.fillRect(0, canvas.height - h, canvas.width, h);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.round(h * 0.38)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const text = `AI WARDROBE SIMULATION · Try A Look${caption ? ` · ${caption}` : ""}`;
  ctx.fillText(text, Math.round(h * 0.4), canvas.height - h / 2, canvas.width - h * 0.8);
  return canvasToBlob(canvas, 0.92);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
