"use client";

import type { EditRequest, GenerateGarment, GenerateRequest, ImageResponse, Look, Project } from "@/lib/types";
import { db } from "./db";
import { postJson } from "./api";
import { toRequestDataUrl } from "./images";

export type Engine = "openai" | "gemini";

async function blobData(id: string | undefined, maxEdge: number): Promise<string | undefined> {
  if (!id) return undefined;
  const blob = await db.getBlob(id);
  return blob ? toRequestDataUrl(blob, maxEdge) : undefined;
}

export async function buildGenerateRequest(project: Project, look: Look): Promise<GenerateRequest> {
  const photos = (
    await Promise.all(project.actor.photoIds.slice(0, 3).map((id) => blobData(id, 1024)))
  ).filter((x): x is string => Boolean(x));

  const garments: GenerateGarment[] = [];
  for (const slot of look.layers) {
    const item = slot.itemId ? project.closet.find((c) => c.id === slot.itemId) : undefined;
    if (!slot.garment.trim() && !item) continue;
    const useSource = Boolean(item?.useSourcePhoto && item.sourcePhotoId);
    const image = item ? await blobData(useSource ? item.sourcePhotoId : (item.photoId ?? item.sourcePhotoId), 896) : undefined;
    garments.push({
      role: slot.role,
      garment: slot.garment || item?.name || "",
      colorName: slot.colorName,
      neckline: slot.neckline,
      fabric: slot.fabric,
      fit: slot.fit,
      details: [slot.details, item?.description && !slot.details.includes(item.description) ? item.description : ""]
        .filter((d) => d?.trim())
        .join("; "),
      image,
      // Scanned items come from a rack photo; even the crop can show neighbors.
      isGroupPhoto: Boolean(image && item?.sourcePhotoId),
      location: item?.location,
    });
  }

  return {
    actor: { ageRange: project.actor.ageRange, photos },
    look: {
      hair: look.hair,
      expression: look.expression,
      backdrop: look.backdrop,
      framing: look.framing,
      garments,
    },
    variations: 1,
  };
}

export function requestGenerate(body: GenerateRequest, signal?: AbortSignal) {
  return postJson<ImageResponse>("/api/generate", body, signal);
}

export async function requestEdit(opts: {
  project: Project;
  renderImageId: string;
  instruction: string;
  garmentPhotoId?: string;
  engine?: Engine;
  signal?: AbortSignal;
}): Promise<ImageResponse> {
  const image = await blobData(opts.renderImageId, 1280);
  if (!image) throw new Error("That preview is missing — try generating it again.");
  const body: EditRequest = {
    image,
    actorPhoto: await blobData(opts.project.actor.photoIds[0], 1024),
    garmentImage: await blobData(opts.garmentPhotoId, 896),
    instruction: opts.instruction,
    engine: opts.engine,
  };
  return postJson<ImageResponse>("/api/edit", body, opts.signal);
}
