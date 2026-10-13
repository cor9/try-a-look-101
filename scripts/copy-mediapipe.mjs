// Copies MediaPipe's WebAssembly runtime into public/ so Face Lock loads it from
// our own domain (no third-party CDN, and photos never leave the browser).
import { cpSync, mkdirSync, existsSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
if (!existsSync(from)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision not installed; skipping");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  cpSync(`${from}/${f}`, `${to}/${f}`);
}
console.log("copy-mediapipe: copied wasm runtime to", to);
