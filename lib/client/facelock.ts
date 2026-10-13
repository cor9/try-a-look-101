"use client";

// Face Lock: image models redraw the whole picture, so even with good prompts
// they can hand back a convincing stranger. After a preview is generated we put
// the actor's real face back: find face landmarks in the actor's photo and in
// the preview, align them, match color/lighting, and blend the real face in.
// Everything runs in the browser (MediaPipe, self-hosted) — no extra uploads.

import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_BASE = "/mediapipe/wasm";
const MODEL_URL = "/mediapipe/face_landmarker.task";

// MediaPipe face-mesh indices.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
// Stable points for alignment: eye corners, brows, nose, mouth corners, chin, cheeks.
const ANCHORS = [33, 133, 362, 263, 70, 300, 168, 6, 1, 2, 61, 291, 0, 17, 199, 152, 234, 454];
const RIGHT_EYE = [33, 133];
const LEFT_EYE = [362, 263];
const NOSE_TIP = 1;

type Pt = { x: number; y: number };

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function landmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })().catch((err) => {
      landmarkerPromise = null; // allow a retry later
      throw err;
    });
  }
  return landmarkerPromise;
}

interface FaceImage {
  canvas: HTMLCanvasElement;
  points: Pt[]; // pixel coordinates for all 478 landmarks
  yaw: number;
  eyeDist: number;
}

async function toCanvas(blob: Blob, maxEdge = 2048): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

async function analyze(blob: Blob): Promise<FaceImage | null> {
  const canvas = await toCanvas(blob);
  const lm = await landmarker();
  const result = lm.detect(canvas);
  const face: NormalizedLandmark[] | undefined = result.faceLandmarks?.[0];
  if (!face?.length) return null;
  const points = face.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
  const mid = (ids: number[]) => ({ x: avg(ids.map((i) => points[i].x)), y: avg(ids.map((i) => points[i].y)) });
  const r = mid(RIGHT_EYE);
  const l = mid(LEFT_EYE);
  const eyeDist = Math.hypot(l.x - r.x, l.y - r.y);
  const eyesMid = { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 };
  // Rough head turn: how far the nose sits from the middle of the eyes.
  const yaw = (points[NOSE_TIP].x - eyesMid.x) / Math.max(1, eyeDist);
  return { canvas, points, yaw, eyeDist };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Least-squares similarity transform (scale, rotation, translation) mapping src → dst. */
function similarity(src: Pt[], dst: Pt[]) {
  const ms = { x: avg(src.map((p) => p.x)), y: avg(src.map((p) => p.y)) };
  const md = { x: avg(dst.map((p) => p.x)), y: avg(dst.map((p) => p.y)) };
  let num1 = 0;
  let num2 = 0;
  let den = 0;
  src.forEach((p, i) => {
    const sx = p.x - ms.x;
    const sy = p.y - ms.y;
    const dx = dst[i].x - md.x;
    const dy = dst[i].y - md.y;
    num1 += sx * dx + sy * dy;
    num2 += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  });
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: md.x - (a * ms.x - b * ms.y), ty: md.y - (b * ms.x + a * ms.y) };
}

export interface FaceLockResult {
  blob: Blob;
  locked: boolean;
  reason?: string;
}

const sourceCache = new Map<string, Promise<FaceImage | null>>();

/**
 * Put the actor's real face onto a generated preview.
 * `sources` are the actor's reference photos keyed by a stable id (for caching).
 */
export async function lockFace(generated: Blob, sources: { id: string; blob: Blob }[]): Promise<FaceLockResult> {
  try {
    const target = await analyze(generated);
    if (!target) return { blob: generated, locked: false, reason: "No face found in the preview." };

    const analyzed = (
      await Promise.all(
        sources.map(async (s) => {
          if (!sourceCache.has(s.id)) sourceCache.set(s.id, analyze(s.blob));
          return sourceCache.get(s.id)!;
        }),
      )
    ).filter((f): f is FaceImage => Boolean(f));
    if (!analyzed.length) return { blob: generated, locked: false, reason: "No face found in the actor's photos." };

    // Use the reference photo whose head angle best matches the preview (ties → larger, sharper face).
    const source = analyzed.reduce((best, f) =>
      Math.abs(f.yaw - target.yaw) - f.eyeDist / 5000 < Math.abs(best.yaw - target.yaw) - best.eyeDist / 5000 ? f : best,
    );

    const t = similarity(
      ANCHORS.map((i) => source.points[i]),
      ANCHORS.map((i) => target.points[i]),
    );
    const scale = Math.hypot(t.a, t.b);
    const angle = Math.atan2(t.b, t.a);
    if (target.eyeDist < 24 || scale < 0.15 || scale > 6 || Math.abs(angle) > 0.6) {
      return { blob: generated, locked: false, reason: "The preview's face angle was too different to lock safely." };
    }

    const W = target.canvas.width;
    const H = target.canvas.height;

    // 1) Warp the actor's photo into the preview's coordinates.
    const warped = document.createElement("canvas");
    warped.width = W;
    warped.height = H;
    const wctx = warped.getContext("2d", { willReadFrequently: true })!;
    wctx.imageSmoothingQuality = "high";
    wctx.setTransform(t.a, t.b, -t.b, t.a, t.tx, t.ty);
    wctx.drawImage(source.canvas, 0, 0);
    wctx.setTransform(1, 0, 0, 1, 0, 0);

    // 2) Soft-edged mask: only where the actor's face (moved into place) and the
    //    preview's face overlap, so cheeks never spill onto hair or background.
    const ovalSrc = FACE_OVAL.map((i) => {
      const p = source.points[i];
      return { x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty };
    });
    const ovalTgt = FACE_OVAL.map((i) => target.points[i]);
    const M = intersectMasks(ringMask(ovalSrc, W, H), ringMask(ovalTgt, W, H));

    // 3) Match the real face's color to the new lighting, then carry over the
    //    preview's broad shading (low frequencies) while keeping the actor's
    //    own detail (high frequencies) — this hides the seam.
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const octx = out.getContext("2d", { willReadFrequently: true })!;
    octx.drawImage(target.canvas, 0, 0);
    const T = octx.getImageData(0, 0, W, H);
    const S = wctx.getImageData(0, 0, W, H).data;

    const stats = [0, 1, 2].map(() => ({ sm: 0, ss: 0, tm: 0, ts: 0 }));
    let n = 0;
    for (let i = 0; i < M.length; i++) {
      if (M[i] < 230 || S[i * 4 + 3] < 250) continue;
      n++;
      for (let ch = 0; ch < 3; ch++) {
        const sv = S[i * 4 + ch];
        const tv = T.data[i * 4 + ch];
        stats[ch].sm += sv;
        stats[ch].ss += sv * sv;
        stats[ch].tm += tv;
        stats[ch].ts += tv * tv;
      }
    }
    if (n < 200) return { blob: generated, locked: false, reason: "The face in the preview was too small to lock." };
    const xf = stats.map((st) => {
      const sm = st.sm / n;
      const tm = st.tm / n;
      const sd = Math.sqrt(Math.max(1, st.ss / n - sm * sm));
      const td = Math.sqrt(Math.max(1, st.ts / n - tm * tm));
      return { sm, tm, gain: Math.min(1.35, Math.max(0.75, td / sd)) };
    });

    // Color-matched source, only inside the mask.
    const SM = new Float32Array(W * H * 3);
    for (let i = 0; i < M.length; i++) {
      if (!M[i]) continue;
      for (let ch = 0; ch < 3; ch++) {
        const raw = S[i * 4 + ch];
        SM[i * 3 + ch] = raw + ((raw - xf[ch].sm) * xf[ch].gain + xf[ch].tm - raw) * 0.85;
      }
    }

    // Smooth (target − source) difference, normalized by mask weight.
    const cell = Math.max(4, target.eyeDist / 3.5);
    const lowDiff = smoothDifference(T.data, SM, M, W, H, cell);

    const D = T.data;
    for (let i = 0; i < M.length; i++) {
      const alpha = (M[i] / 255) * (S[i * 4 + 3] / 255);
      if (alpha <= 0.003) continue;
      for (let ch = 0; ch < 3; ch++) {
        const v = SM[i * 3 + ch] + lowDiff[i * 3 + ch];
        D[i * 4 + ch] = D[i * 4 + ch] * (1 - alpha) + Math.min(255, Math.max(0, v)) * alpha;
      }
    }
    octx.putImageData(T, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.92),
    );
    return { blob, locked: true };
  } catch (err) {
    console.warn("Face Lock failed", err);
    return { blob: generated, locked: false, reason: "Face Lock couldn't run in this browser." };
  }
}

/** Polygon mask that fades from 0 at the outline to 1 inside (values 0-255, one per pixel). */
function ringMask(poly: Pt[], W: number, H: number): Uint8ClampedArray {
  const c = { x: avg(poly.map((p) => p.x)), y: avg(poly.map((p) => p.y)) };
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.globalCompositeOperation = "lighter";
  const steps = 18;
  for (let k = 0; k < steps; k++) {
    // Fade from 90% of the face outline in to 62%: the jaw edge and its shadow stay the
    // preview's, while eyes, brows, nose, mouth and cheeks come from the real photo.
    const s = 0.9 - (k / steps) * 0.28;
    ctx.fillStyle = `rgba(255,255,255,${1 / steps})`;
    ctx.beginPath();
    poly.forEach((p, i) => {
      const x = c.x + (p.x - c.x) * s;
      const y = c.y + (p.y - c.y) * s;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

function intersectMasks(a: Uint8ClampedArray, b: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.min(a[i], b[i]);
  return out;
}

/**
 * Low-frequency part of (target − source) inside the mask, via a normalized
 * blur (blur(d·m) / blur(m)) done by downscaling and bilinear upscaling.
 */
function smoothDifference(
  T: Uint8ClampedArray,
  SM: Float32Array,
  M: Uint8ClampedArray,
  W: number,
  H: number,
  cell: number,
): Float32Array {
  const w = Math.max(2, Math.round(W / cell));
  const h = Math.max(2, Math.round(H / cell));
  // Accumulate per-cell sums directly (exact box filter), then bilinear-sample.
  const sum = new Float32Array(w * h * 3);
  const wsum = new Float32Array(w * h);
  for (let y = 0; y < H; y++) {
    const cy = Math.min(h - 1, Math.floor((y / H) * h));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const m = M[i] / 255;
      if (m <= 0) continue;
      const cx = Math.min(w - 1, Math.floor((x / W) * w));
      const k = cy * w + cx;
      wsum[k] += m;
      for (let ch = 0; ch < 3; ch++) sum[k * 3 + ch] += (T[i * 4 + ch] - SM[i * 3 + ch]) * m;
    }
  }
  // Light 3x3 smoothing over cells, still normalized by weight.
  const cellVal = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ws = 0;
      const acc = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          ws += wsum[k];
          for (let ch = 0; ch < 3; ch++) acc[ch] += sum[k * 3 + ch];
        }
      }
      const k = y * w + x;
      for (let ch = 0; ch < 3; ch++) cellVal[k * 3 + ch] = ws > 0 ? acc[ch] / ws : 0;
    }
  }
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1.001, Math.max(0, (y / H) * h - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!M[i]) continue;
      const fx = Math.min(w - 1.001, Math.max(0, (x / W) * w - 0.5));
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      for (let ch = 0; ch < 3; ch++) {
        const v00 = cellVal[(y0 * w + x0) * 3 + ch];
        const v10 = cellVal[(y0 * w + x0 + 1) * 3 + ch];
        const v01 = cellVal[((y0 + 1) * w + x0) * 3 + ch];
        const v11 = cellVal[((y0 + 1) * w + x0 + 1) * 3 + ch];
        out[i * 3 + ch] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      }
    }
  }
  return out;
}
