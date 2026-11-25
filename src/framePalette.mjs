// The frame colours, shared by the app (src/frame.ts) and the static pages
// (scripts/build-content.mjs). One hue in, two gradient stops plus the ink that
// reads on them out. Every text colour that sits on the frame is measured on
// both stops; if a hue would fall short of 4.5:1, the stops are nudged lighter
// (light theme) or darker (dark theme) until it passes, so any hue a person
// picks stays readable.

// Peach: the app's default frame, the same hue as the guides pages.
export const DEFAULT_HUE = 22;
export const SOFT_ALPHA = 0.76;
const INK_DARK = [14, 24, 38];
const INK_LIGHT = [238, 244, 255];

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

export const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

export function luminance([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// What a translucent ink actually looks like over a given background.
export const over = (ink, alpha, bg) => ink.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

function worst(ink, stops) {
  let min = Infinity;
  for (const stop of stops) {
    min = Math.min(min, contrast(ink, stop), contrast(over(ink, SOFT_ALPHA, stop), stop));
  }
  return min;
}

/**
 * @param {number} hue 0-360
 * @param {"light"|"dark"} scheme
 * @param {number} [sat] 0-1 multiplier on saturation
 */
export function framePalette(hue, scheme, sat = 1) {
  const light = scheme === "light";
  const ink = light ? INK_DARK : INK_LIGHT;
  let la = light ? 85 : 16;
  let lb = light ? 77 : 9;
  let stops;
  for (let step = 0; step < 40; step++) {
    stops = light
      ? [hslToRgb(hue, 58 * sat, la), hslToRgb(hue + 28, 50 * sat, lb)]
      : [hslToRgb(hue, 46 * sat, la), hslToRgb(hue + 28, 40 * sat, lb)];
    if (worst(ink, stops) >= 4.5) break;
    la += light ? 1 : -1;
    lb += light ? 1 : -1;
  }
  const ratio = worst(ink, stops);
  if (ratio < 4.5) throw new Error(`Frame contrast could not reach 4.5:1 for hue ${hue} (${scheme})`);
  const [r, g, b] = ink;
  return {
    a: hex(stops[0]),
    b: hex(stops[1]),
    ratio,
    vars: {
      "--frame-a": hex(stops[0]),
      "--frame-b": hex(stops[1]),
      "--frame-ink": `rgb(${r} ${g} ${b})`,
      "--frame-ink-rgb": `${r}, ${g}, ${b}`,
      "--frame-ink-soft": `rgb(${r} ${g} ${b} / ${SOFT_ALPHA})`,
      "--frame-hover": `rgb(${r} ${g} ${b} / 0.1)`,
      "--frame-active": `rgb(${r} ${g} ${b} / 0.16)`,
      "--frame-line": `rgb(${r} ${g} ${b} / 0.16)`,
    },
  };
}
