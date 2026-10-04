// Theme registry. To add a theme: add one entry to THEMES below (id, name, group, scheme, mono, tokens).
// Tokens are colours only. Any token you leave out is derived (see expandTokens) so most entries need just
// bg, surface, text, accent and the four state colours (healthy, caution, alert, critical).
import { CONTRAST } from './config.js';
import { mix, ensureContrast, rotateHue, contrast, lum } from './color.js';

export const DEFAULT_THEME = 'midnight';
export const THEME_STORAGE_KEY = 'deepwatch.theme';
export const TOKEN_KEYS = ['bg', 'surface', 'surface2', 'border', 'text', 'text2', 'text3', 'accent', 'onAccent', 'btn',
  'healthy', 'caution', 'alert', 'critical', 'c1', 'c2', 'c3', 'c4', 'focus', 'tint', 'bgImage', 'bw', 'ring'];
export const STATE_KEYS = ['healthy', 'caution', 'alert', 'critical'];

export function expandTokens(t, { mono = false } = {}) {
  const o = { ...t };
  o.surface2 ??= mix(o.surface, o.text, 0.07);
  o.border ??= mix(o.surface, o.text, 0.28);
  o.tint ??= '14%';
  o.bw ??= '1px';
  o.ring ??= '3px';
  const pct = parseFloat(o.tint) / 100;
  const tints = STATE_KEYS.map((s) => mix(o.surface, o[s], pct));
  const bgs = [o.bg, o.surface, o.surface2, ...tints];
  o.text2 ??= ensureContrast(mix(o.text, o.surface, 0.2), bgs, 4.6);
  o.text3 ??= ensureContrast(mix(o.text, o.surface, 0.45), bgs, 3.3);
  // Button text: white on light themes, black on dark ones (unless the theme sets it). The button fill is the
  // accent nudged just far enough to reach AAA (7:1) against that text, so Start/Next/Resume always read clearly.
  o.onAccent ??= lum(o.surface) > 0.4 ? '#ffffff' : '#000000';
  o.btn ??= ensureContrast(o.accent, [o.onAccent], CONTRAST.buttonText);
  const grounds = [o.bg, o.surface, o.surface2];
  o.focus ??= ensureContrast(o.accent, grounds, 3.4);
  o.c1 ??= o.accent;
  if (mono) {
    o.c2 ??= ensureContrast(mix(o.accent, o.text, 0.5), grounds, 3.4);
    o.c3 ??= ensureContrast(mix(o.accent, o.surface, 0.4), grounds, 3.4);
    o.c4 ??= o.text;
  } else {
    o.c2 ??= ensureContrast(rotateHue(o.accent, 120), grounds, 3.4);
    o.c3 ??= ensureContrast(rotateHue(o.accent, 200), grounds, 3.4);
    o.c4 ??= ensureContrast(rotateHue(o.accent, 280), grounds, 3.4);
  }
  o.bgImage ??= 'none';
  return o;
}

const T = (id, name, group, scheme, mono, tokens) => ({ id, name, group, scheme, mono, tokens: expandTokens(tokens, { mono }) });
const DS = { healthy: '#4fd1a5', caution: '#f2cc4b', alert: '#ff9a3d', critical: '#ff5d6c' }; // default dark states
const LS = { healthy: '#12805c', caution: '#966600', alert: '#c24500', critical: '#c0152f' }; // default light states
const d = (id, name, tokens, mono = false) => T(id, name, 'Dark', 'dark', mono, { ...DS, ...tokens });
const l = (id, name, tokens, mono = false) => T(id, name, 'Light', 'light', mono, { ...LS, ...tokens });

export const THEMES = [
  // ---------------------------------------------------------------- Core (full explicit blocks)
  T('midnight', 'Midnight', 'Core', 'dark', false, {
    bg: '#0b1220', surface: '#121c2e', surface2: '#1a2740', border: '#2b3b57',
    text: '#e8eef8', text2: '#b4c1d6', text3: '#9aa9c1', accent: '#5aa9ff', onAccent: '#06101f',
    healthy: '#70ebc2', caution: '#faed99', alert: '#f4a02a', critical: '#f76464',
    c1: '#5aa9ff', c2: '#b794f6', c3: '#f9a8d4', c4: '#a3e635', focus: '#9ecbff', tint: '14%', bgImage: 'none',
  }),
  T('paper', 'Paper', 'Core', 'light', false, {
    bg: '#f3f5f9', surface: '#ffffff', surface2: '#eef1f6', border: '#c5cedc',
    text: '#14202e', text2: '#3a4a5f', text3: '#566579', accent: '#0b5fc4', onAccent: '#ffffff',
    healthy: '#006da3', caution: '#8a6b00', alert: '#7f2800', critical: '#b80a52',
    c1: '#0b5fc4', c2: '#6b3fb0', c3: '#a3155f', c4: '#4a6b00', focus: '#0b5fc4', tint: '12%', bgImage: 'none',
  }),
  T('high-contrast', 'High Contrast', 'Core', 'dark', false, {
    bg: '#000000', surface: '#0d0d0d', surface2: '#1a1a1a', border: '#ffffff',
    text: '#ffffff', text2: '#f2f2f2', text3: '#dcdcdc', accent: '#00d5ff', onAccent: '#000000',
    healthy: '#25aff4', caution: '#fff5b3', alert: '#ff8b38', critical: '#fbb1ca',
    c1: '#00d5ff', c2: '#ff7bd5', c3: '#ffe600', c4: '#b4ff5a', focus: '#ffffff', tint: '0%', bgImage: 'none', bw: '3px', ring: '5px',
  }),

  // ---------------------------------------------------------------- Dark (26)
  d('matrix', 'Matrix', { bg: '#020a02', surface: '#07140a', text: '#b8ffc8', accent: '#39ff6a', healthy: '#2fa34f', caution: '#6fd488', alert: '#a6f5b8', critical: '#e8ffee' }, true),
  d('synthwave', 'Synthwave', { bg: '#1a1033', surface: '#261a4a', text: '#f3e8ff', accent: '#ff4fd8', healthy: '#2de2e6', caution: '#ffe14d', alert: '#ff9a3c', critical: '#ff5a5a', c2: '#2de2e6', c3: '#ffe14d', c4: '#b388ff' }),
  d('terminal', 'Terminal', { bg: '#0c0700', surface: '#181005', text: '#ffb000', accent: '#ffcc33', healthy: '#b87800', caution: '#e09a00', alert: '#ffc24d', critical: '#fff0c2' }, true),
  d('shades-of-grey', 'Shades of Grey', { bg: '#1b1b1b', surface: '#262626', text: '#e6e6e6', accent: '#bdbdbd', healthy: '#8a8a8a', caution: '#aaaaaa', alert: '#cfcfcf', critical: '#ffffff' }, true),
  d('nord', 'Nord', { bg: '#2e3440', surface: '#3b4252', surface2: '#434c5e', text: '#eceff4', accent: '#88c0d0', healthy: '#a3be8c', caution: '#ebcb8b', alert: '#dd9873', critical: '#ee8a94', c2: '#b48ead', c3: '#81a1c1', c4: '#ebcb8b' }),
  d('one-dark', 'One Dark', { bg: '#21252b', surface: '#282c34', surface2: '#2c313a', text: '#abb2bf', accent: '#61afef', healthy: '#98c379', caution: '#e5c07b', alert: '#e3905a', critical: '#e06c75', c2: '#c678dd', c3: '#56b6c2', c4: '#e5c07b' }),
  d('ocean-deep', 'Ocean Deep', { bg: '#04141f', surface: '#082a3a', text: '#d4f1f4', accent: '#2ec4b6', healthy: '#4ade80', caution: '#f4d35e', alert: '#ff9f1c', critical: '#ff595e' }),
  d('forest', 'Forest', { bg: '#0e1a12', surface: '#17291c', border: '#5a4632', text: '#e3efd8', accent: '#a3b565', healthy: '#7fd66b', caution: '#e3c34d', alert: '#e08a3c', critical: '#ee6055' }),
  d('sunset', 'Sunset', { bg: '#1d1233', surface: '#2a1a47', text: '#ffe9d6', accent: '#ffc857', healthy: '#5fd3b0', caution: '#ffe066', alert: '#ff8c42', critical: '#ff5277', c2: '#ff7a59', c3: '#7b6cf6', c4: '#5fd3b0' }),
  d('ghost-in-the-shell', 'Ghost in the Shell', { bg: '#04100f', surface: '#0a1f1e', text: '#cfeee8', accent: '#36e2c0', healthy: '#4be08f', caution: '#e8d44d', alert: '#ff9a3d', critical: '#ff5470' }),
  d('cyberpunk', 'Cyberpunk', { bg: '#0a0a0f', surface: '#15141f', text: '#f5f5e8', accent: '#fcee0a', healthy: '#05d9e8', caution: '#ffb800', alert: '#ff7a1a', critical: '#ff2a6d', c2: '#05d9e8', c3: '#ff2a6d', c4: '#b388ff' }),
  d('blueprint', 'Blueprint', { bg: '#0d3b8c', surface: '#124aa8', surface2: '#0f43a0', text: '#ffffff', accent: '#bfd6ff', healthy: '#7db0ff', caution: '#a3c3ff', alert: '#c9dcff', critical: '#ffffff' }, true),
  d('tron', 'Tron', { bg: '#04070d', surface: '#0b1320', text: '#d6f6ff', accent: '#19e3ff', healthy: '#3dffb0', caution: '#ffd23f', alert: '#ff8a1f', critical: '#ff4747', c2: '#ff8a1f', c3: '#3dffb0', c4: '#d6f6ff' }),
  d('radioactive', 'Radioactive', { bg: '#050700', surface: '#101600', text: '#e8ff9a', accent: '#c6ff00', healthy: '#7dff4d', caution: '#ffd000', alert: '#ff8a00', critical: '#ff4538' }),
  d('biohazard', 'Biohazard', { bg: '#17171a', surface: '#232327', text: '#f1efe6', accent: '#9be15d', healthy: '#4cc9a0', caution: '#ffd60a', alert: '#ff8a1f', critical: '#ff5a4f', c2: '#ffd60a', c3: '#ff8a1f', c4: '#4cc9a0' }),
  d('military', 'Military', { bg: '#1d2216', surface: '#2a3120', text: '#e6e2c3', accent: '#c2b280', healthy: '#8fbf6a', caution: '#e0c24f', alert: '#d98b3a', critical: '#ef6a5b' }),
  d('akira', 'Akira', { bg: '#111216', surface: '#1b1d23', text: '#e4e7ee', accent: '#9fb4cc', healthy: '#4fd1b0', caution: '#f0c419', alert: '#ff7a1a', critical: '#ff3b3b', border: '#7a2328' }),
  d('autumn', 'Autumn', { bg: '#1f130c', surface: '#2d1c12', text: '#f3dfc8', accent: '#e6b450', healthy: '#9bbf6a', caution: '#f2d06b', alert: '#e8873a', critical: '#f0614c' }),
  d('gunmetal', 'Gunmetal', { bg: '#14181e', surface: '#1e252e', text: '#dfe6ee', accent: '#7fa3c7', healthy: '#5fd0b0', caution: '#e9c46a', alert: '#f4a261', critical: '#ef6b6b' }),
  d('diablo', 'Diablo', { bg: '#0a0405', surface: '#180a0c', border: '#6b1a1f', text: '#f0d9cf', accent: '#c8a97e', healthy: '#7fcf9a', caution: '#f2c14e', alert: '#ff8a3d', critical: '#ff4d4d' }),
  d('pacific-northwest', 'Pacific Northwest', { bg: '#131a1a', surface: '#1e2828', text: '#dfe6e1', accent: '#6fa3b5', healthy: '#86b98a', caution: '#d8b45a', alert: '#d98b4a', critical: '#e8695a' }),
  d('bumblebee', 'Bumblebee', { bg: '#0b0b0b', surface: '#1a1a1a', text: '#ffe97a', accent: '#ffd400', healthy: '#8be28b', caution: '#ffd400', alert: '#ff8c1a', critical: '#ff4d4d' }),
  d('halloween', 'Halloween', { bg: '#0d0711', surface: '#1c1026', text: '#f4e6d0', accent: '#b66dff', healthy: '#6fdc8c', caution: '#ffd23f', alert: '#ff7a1a', critical: '#ff4059', c2: '#ff7a1a', c3: '#6fdc8c', c4: '#f4e6d0' }),
  d('x-mas', 'X-mas', { bg: '#0f2418', surface: '#173525', text: '#f6efe0', accent: '#e8c15a', healthy: '#7fd48a', caution: '#f4d35e', alert: '#f29a3c', critical: '#ff5a5a', c2: '#ff5a5a', c3: '#7fd48a', c4: '#f6efe0' }),
  d('the-joker', 'The Joker', { bg: '#1a0b2e', surface: '#281445', text: '#f1f0e6', accent: '#9dff2e', healthy: '#38e0a8', caution: '#ffd23f', alert: '#ff8a3d', critical: '#ff4d6a', c2: '#c084fc', c3: '#f1f0e6', c4: '#ffd23f' }),
  d('rgb', 'RGB', { bg: '#121316', surface: '#1c1e23', text: '#eceff4', accent: '#5b9dff', healthy: '#41d97a', caution: '#f2cc4b', alert: '#ff9a3d', critical: '#ff5d6c', c1: '#ff5555', c2: '#55e07a', c3: '#5b9dff', c4: '#eceff4' }),

  // ---------------------------------------------------------------- Light (17)
  l('ghost', 'Ghost', { bg: '#f1f3f6', surface: '#fafbfc', text: '#1f2933', accent: '#3f64a0' }),
  l('candy', 'Candy', { bg: '#ffe6f2', surface: '#fff5fa', text: '#4a2540', accent: '#7c4dc4', c2: '#0f8a6a', c3: '#c2188a', c4: '#5b6dd6' }),
  l('citrus', 'Citrus', { bg: '#fff8d6', surface: '#fffdf0', text: '#3b3000', accent: '#4f8a00', c2: '#c24500', c3: '#966600', c4: '#2d6a4f' }),
  l('arizona-green-tea', 'Arizona Green Tea', { bg: '#e6f4ea', surface: '#fbf8ee', text: '#1f3a2a', accent: '#c0507b', healthy: '#12805c', critical: '#b01228', c2: '#2f7d5b', c3: '#8a6d1d', c4: '#5a6fa8' }),
  l('adventure-time', 'Adventure Time', { bg: '#cfeeff', surface: '#eaf8ff', text: '#0b2a45', accent: '#1c6fc4', healthy: '#1f7a35', c2: '#1f7a35', c3: '#8a6a00', c4: '#7a3fb0' }),
  l('tie-dye', 'Tie Dye', { bg: '#f1e4ff', surface: '#faf3ff', text: '#2c1b47', accent: '#6a3fc0', c2: '#0f7f8a', c3: '#b3267a', c4: '#3a7f2a', bgImage: 'radial-gradient(circle at 15% 20%, #ffd6ec 0, transparent 40%), radial-gradient(circle at 85% 25%, #cfe8ff 0, transparent 42%), radial-gradient(circle at 50% 90%, #d8ffd9 0, transparent 45%)' }),
  l('spring', 'Spring', { bg: '#ecf8de', surface: '#fbfff4', text: '#26401a', accent: '#bf3374', c2: '#2f7a1f', c3: '#8a6a00', c4: '#4a5fb0' }),
  l('jazz-solo-cup', 'Jazz Solo Cup', { bg: '#ffffff', surface: '#f6f7fb', text: '#1b1b2f', accent: '#007a87', c2: '#6a3fb5', c3: '#c24500', c4: '#2d6a4f' }),
  l('tropical', 'Tropical', { bg: '#ffeccc', surface: '#fffaf0', text: '#12403e', accent: '#007a80', healthy: '#1d7436', c2: '#c9462c', c3: '#1d7436', c4: '#8a6a00' }),
  l('peaches-and-cream', 'Peaches & Cream', { bg: '#ffe2cc', surface: '#fff6ee', text: '#4a2a1a', accent: '#8f4f7a', c2: '#8f4f7a', c3: '#0f7a62', c4: '#5a5fa8' }),
  l('american-southwest', 'American Southwest', { bg: '#f0dcc0', surface: '#fbf1e0', text: '#3b2418', accent: '#16797a', c2: '#a5492a', c3: '#5c7a4b', c4: '#8a6a00' }),
  l('national-park-ranger', 'National Park Ranger', { bg: '#ece5cc', surface: '#faf6e8', text: '#20311c', accent: '#2a6a36', c2: '#7a6a2c', c3: '#1c6a8a', c4: '#8a4a2a' }),
  l('sunrise', 'Sunrise', { bg: '#ffead2', surface: '#fff9f0', text: '#4a2a24', accent: '#b8416f', c2: '#8a6a00', c3: '#8f4f7a', c4: '#2d6a7a' }),
  l('minimal', 'Minimal', { bg: '#ffffff', surface: '#f5f5f5', text: '#111111', accent: '#555555', healthy: '#6b6b6b', caution: '#4d4d4d', alert: '#2e2e2e', critical: '#000000' }, true),
  l('sepia', 'Sepia', { bg: '#f1e6d0', surface: '#f9f1e1', text: '#3b2a1a', accent: '#7a5a3a', healthy: '#8a6d4b', caution: '#6f5237', alert: '#523a24', critical: '#2b1a0d' }, true),
  l('jolly-rancher', 'Jolly Rancher', { bg: '#fbe9ff', surface: '#ffffff', text: '#2a1030', accent: '#7b2cbf', healthy: '#1f8a35', alert: '#d04a0a', critical: '#d0194a', c2: '#1971c2', c3: '#1f8a35', c4: '#d0194a' }),
  l('happy-meal', 'Happy Meal', { bg: '#fff1c9', surface: '#fffdf5', text: '#3a1008', accent: '#a56e00', c2: '#b8261c', c3: '#a56e00', c4: '#2d6a4f' }),
];

export const THEME_GROUPS = ['Core', 'Dark', 'Light'];
export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const getTheme = (id) => THEME_BY_ID[id] || THEME_BY_ID[DEFAULT_THEME];

const cssName = (k) => '--' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
export function themeCSS() {
  return THEMES.map((t) => {
    const vars = TOKEN_KEYS.map((k) => `${cssName(k)}:${t.tokens[k]}`).join(';');
    return `html[data-theme="${t.id}"]{color-scheme:${t.scheme};${vars}}`;
  }).join('\n');
}

/* ---- DOM glue (only runs in a browser) ---- */

export function loadSavedThemeId() {
  try { const id = localStorage.getItem(THEME_STORAGE_KEY); return THEME_BY_ID[id] ? id : DEFAULT_THEME; }
  catch { return DEFAULT_THEME; }
}

export function installThemeStyles() {
  if (typeof document === 'undefined' || document.getElementById('theme-tokens')) return;
  const s = document.createElement('style');
  s.id = 'theme-tokens';
  s.textContent = themeCSS();
  document.head.appendChild(s);
}

/** Apply a theme instantly. `persist` saves it; previews pass persist=false. */
export function applyTheme(id, { persist = true } = {}) {
  const t = getTheme(id);
  if (typeof document === 'undefined') return t;
  installThemeStyles();
  const root = document.documentElement;
  root.dataset.theme = t.id;
  root.style.colorScheme = t.scheme;
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, t.id); localStorage.setItem('deepwatch.themeBg', t.tokens.bg); } catch { /* storage unavailable */ }
  }
  return t;
}
