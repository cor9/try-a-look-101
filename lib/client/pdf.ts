"use client";

import { findCastingType } from "@/lib/presets";
import { describeGarment } from "@/lib/prompt";
import { ROLE_LABELS, type Look, type Project } from "@/lib/types";
import { db } from "./db";
import { blobToDataUrl, normalizePhoto } from "./images";
import { packingList } from "./plan";

// jsPDF's built-in Helvetica only covers WinAnsi; swap anything else for safe text.
function safe(text: string): string {
  return text
    .replace(/→/g, "->")
    .replace(/[★☆]/g, "*")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•…]/g, "");
}

async function imageData(id: string | undefined, maxEdge = 700): Promise<{ data: string; w: number; h: number } | null> {
  if (!id) return null;
  const blob = await db.getBlob(id);
  if (!blob) return null;
  const small = await normalizePhoto(blob, maxEdge);
  const bmp = await createImageBitmap(small);
  const out = { data: await blobToDataUrl(small), w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

const NAVY: [number, number, number] = [29, 39, 71];
const COLORS: [number, number, number][] = [
  [42, 79, 160],
  [27, 147, 162],
  [224, 57, 63],
  [242, 154, 31],
];

export async function downloadPlanPdf(project: Project) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  let y = M;

  const actorName = project.actor.name || "Actor";
  const looks = project.plan.lookIds.map((id) => project.looks.find((l) => l.id === id)).filter((l): l is Look => Boolean(l));

  const footer = () => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      safe("All images are AI wardrobe simulations for planning only — not photographs of the actor. Made with Try A Look · tryalook.childactor101.com"),
      W / 2,
      H - 22,
      { align: "center" },
    );
  };
  const ensure = (needed: number) => {
    if (y + needed > H - 50) {
      footer();
      doc.addPage();
      y = M;
    }
  };

  // Header
  try {
    const res = await fetch("/logo.jpeg");
    const logo = await blobToDataUrl(await res.blob());
    doc.addImage(logo, "JPEG", M, y - 6, 84, 63);
  } catch {
    /* logo is decorative */
  }
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(safe(`${actorName}'s Headshot Wardrobe Plan`), M + 100, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(80);
  const meta = [
    project.name,
    project.plan.sessionDate && `Session: ${new Date(project.plan.sessionDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}`,
    project.plan.photographer && `Photographer: ${project.plan.photographer}`,
    project.actor.ageRange && `Age range: ${project.actor.ageRange}`,
  ].filter(Boolean) as string[];
  doc.text(safe(meta.join("   ·   ")), M + 100, y + 38, { maxWidth: W - M * 2 - 100 });
  y += 76;
  doc.setDrawColor(230);
  doc.line(M, y, W - M, y);
  y += 22;

  // Looks
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Looks (${looks.length})`, M, y);
  y += 16;

  for (const [i, look] of looks.entries()) {
    const r = look.renders.find((x) => x.id === look.selectedRenderId) ?? look.renders[look.renders.length - 1];
    const img = await imageData(r?.imageId);
    const boxW = 112;
    const boxH = 140;
    ensure(boxH + 30);

    const top = y + 6;
    const color = COLORS[i % COLORS.length];
    doc.setFillColor(...color);
    doc.circle(M + 12, top + 12, 12, "F");
    doc.setTextColor(255);
    doc.setFontSize(11);
    doc.text(String(i + 1), M + 12, top + 16, { align: "center" });

    const imgX = M + 34;
    doc.setFillColor(240, 238, 234);
    doc.roundedRect(imgX, top, boxW, boxH, 6, 6, "F");
    if (img) {
      const scale = Math.min(boxW / img.w, boxH / img.h);
      const w = img.w * scale;
      const h = img.h * scale;
      doc.addImage(img.data, "JPEG", imgX + (boxW - w) / 2, top + (boxH - h) / 2, w, h);
      doc.setFillColor(29, 39, 71);
      doc.rect(imgX, top + boxH - 13, boxW, 13, "F");
      doc.setFontSize(6.5);
      doc.setTextColor(255);
      doc.text("AI WARDROBE SIMULATION", imgX + boxW / 2, top + boxH - 4.5, { align: "center" });
    } else {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text("No preview yet", imgX + boxW / 2, top + boxH / 2, { align: "center" });
    }

    const tx = imgX + boxW + 16;
    const tw = W - M - tx;
    let ty = top + 12;
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(safe(look.title), tx, ty, { maxWidth: tw });
    ty += 15;
    const type = findCastingType(look.castingType, project.customCastingTypes);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...color);
    if (type) {
      doc.text(safe(type.title.toUpperCase()), tx, ty);
      ty += 14;
    }
    doc.setTextColor(50);
    for (const slot of look.layers) {
      const text = describeGarment(slot);
      if (!text) continue;
      const lines = doc.splitTextToSize(safe(`${ROLE_LABELS[slot.role]}: ${text}`), tw);
      doc.text(lines, tx, ty);
      ty += lines.length * 12;
    }
    doc.setTextColor(110);
    const extra = [`Background: ${look.backdrop.colorName}, ${look.backdrop.style}`, `Expression: ${look.expression}`, look.hair && `Hair: ${look.hair}`].filter(Boolean) as string[];
    for (const e of extra) {
      const lines = doc.splitTextToSize(safe(e), tw);
      doc.text(lines, tx, ty);
      ty += lines.length * 11.5;
    }
    const note = project.plan.lookNotes[look.id];
    if (note?.trim()) {
      ty += 2;
      doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(safe(`Notes: ${note.trim()}`), tw);
      doc.text(lines, tx, ty);
      ty += lines.length * 12;
    }
    y = Math.max(top + boxH, ty) + 18;
  }

  // Packing list
  const items = packingList(project);
  ensure(60);
  doc.setDrawColor(230);
  doc.line(M, y, W - M, y);
  y += 24;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Packing checklist", M, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(40);
  const tips = ["Lint roller and steamer or wrinkle spray", "Hairbrush, hair ties, clips", "Water and a snack"];
  for (const it of [...items.map((x) => `${x.label}  (Look ${x.looks.join(", ")})`), ...tips]) {
    const lines = doc.splitTextToSize(safe(it), W - M * 2 - 22);
    ensure(lines.length * 13 + 4);
    doc.setDrawColor(150);
    doc.rect(M, y - 9, 10, 10);
    doc.text(lines, M + 18, y);
    y += lines.length * 13 + 4;
  }

  if (project.plan.prepNotes.trim()) {
    y += 10;
    ensure(50);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Preparation notes", M, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(safe(project.plan.prepNotes.trim()), W - M * 2);
    for (const line of lines) {
      ensure(14);
      doc.text(line, M, y);
      y += 13.5;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    footer();
  }
  doc.save(`${actorName.replace(/\W+/g, "-").toLowerCase()}-headshot-wardrobe-plan.pdf`);
}
