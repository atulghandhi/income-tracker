// The app's frame: the coloured surface the sidebar sits on and the canvas
// rests on. One hue drives it (the person's choice, stored per device like the
// theme), and src/framePalette.mjs guarantees readable text on every stop.
import { DEFAULT_HUE, framePalette } from "./framePalette.mjs";

export const HUE_KEY = "it_hue";
export const GRAIN_KEY = "it_grain";
export const DEFAULT_GRAIN = 0.06;
// The app frame is a little more saturated than the static pages: it is a chosen colour, not a section hint.
const APP_SAT = 1.45;
export { DEFAULT_HUE };

export function readStoredHue(): number {
  try {
    const raw = localStorage.getItem(HUE_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 360) return n;
  } catch {
    // localStorage unavailable: use the brand hue.
  }
  return DEFAULT_HUE;
}

export function readStoredGrain(): number {
  try {
    const raw = localStorage.getItem(GRAIN_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 0.3) return n;
  } catch {
    // localStorage unavailable: default grain.
  }
  return DEFAULT_GRAIN;
}

export function storeFrame(hue: number, grain: number) {
  try {
    localStorage.setItem(HUE_KEY, String(Math.round(hue)));
    localStorage.setItem(GRAIN_KEY, grain.toFixed(2));
  } catch {
    // Not persisted; the frame still changes for this visit.
  }
}

// Grain as an image whose alpha is the grain amount, so it can sit in the same
// fixed background as the gradient on every frame surface and line up exactly.
function grainImage(amount: number): string {
  const a = Math.max(0, Math.min(0.3, amount)).toFixed(3);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 ${a}'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

/** Writes the frame tokens onto <html>. Returns the first stop, for the browser's theme-color. */
export function applyFrame(hue: number, theme: "light" | "dark", grain: number): string {
  const palette = framePalette(hue, theme, APP_SAT);
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(palette.vars)) root.setProperty(name, value);
  root.setProperty("--frame-grain-img", grain > 0 ? grainImage(grain) : "none");
  return palette.a;
}

/** A preview colour for a hue, for swatches in the picker. */
export function framePreview(hue: number, theme: "light" | "dark") {
  const { a, b } = framePalette(hue, theme, APP_SAT);
  return { a, b };
}
