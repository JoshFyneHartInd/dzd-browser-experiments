// Colour math (no DOM). Used by themes.js to derive tokens and by tests/themes.test.js to check contrast.

export function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgb2hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v * (1 - t) + B[i] * t));
}

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const unlin = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function lum(hex) {
  const [r, g, b] = hex2rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgb2hsl(hex) {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}
export function hsl2hex({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgb2hex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** Nudge `fg` lighter or darker (keeping hue) until it reaches `min` contrast against every colour in `bgs`. */
export function ensureContrast(fg, bgs, min) {
  bgs = Array.isArray(bgs) ? bgs : [bgs];
  const worst = (c) => Math.min(...bgs.map((b) => contrast(c, b)));
  if (worst(fg) >= min) return fg;
  const meanBg = bgs.reduce((s, b) => s + lum(b), 0) / bgs.length;
  const dir = meanBg < 0.4 ? 1 : -1;
  const hsl = rgb2hsl(fg);
  for (let i = 0; i < 100; i++) {
    hsl.l = Math.min(1, Math.max(0, hsl.l + dir * 0.01));
    const c = hsl2hex(hsl);
    if (worst(c) >= min) return c;
  }
  return dir > 0 ? '#ffffff' : '#000000';
}

export function rotateHue(hex, deg) {
  const hsl = rgb2hsl(hex);
  hsl.h += deg;
  return hsl2hex(hsl);
}

// CIE Lab and colour difference
export function rgb2lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(lin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE(a, b) {
  const A = rgb2lab(a), B = rgb2lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
export const lightness = (hex) => rgb2lab(hex)[0];

// Colour-vision deficiency simulation (Machado et al. 2009, full severity), applied in linear RGB
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const CVD_TYPES = Object.keys(CVD);
export function simulateCVD(hex, type) {
  const m = CVD[type];
  const v = hex2rgb(hex).map(lin);
  const out = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  return rgb2hex(out.map((c) => unlin(Math.min(1, Math.max(0, c)))));
}
