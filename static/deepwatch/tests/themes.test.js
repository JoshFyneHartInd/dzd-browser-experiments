// Automated theme check: node tests/themes.test.js
// Fails when any theme misses its group's contrast target. Prints warnings for Dark/Light text pairs between 3:1 and 4.5:1.
import { THEMES, TOKEN_KEYS, STATE_KEYS } from '../js/themes.js';
import { CONTRAST } from '../js/config.js';
import { contrast, mix, deltaE, simulateCVD, CVD_TYPES, lightness, rgb2hsl } from '../js/color.js';

const failures = [], warnings = [];
const fail = (t, msg) => failures.push(`${t.name} (${t.group}): ${msg}`);
const warn = (t, msg) => warnings.push(`${t.name} (${t.group}): ${msg}`);
const hex = /^#[0-9a-f]{6}$/i;

// Registry shape
const counts = { Core: 0, Dark: 0, Light: 0 };
for (const t of THEMES) counts[t.group]++;
if (THEMES.length !== 46 || counts.Core !== 3 || counts.Dark !== 26 || counts.Light !== 17) {
  failures.push(`registry should hold 46 themes (3 core, 26 dark, 17 light), found ${THEMES.length} (${JSON.stringify(counts)})`);
}
if (new Set(THEMES.map((t) => t.id)).size !== THEMES.length) failures.push('theme ids are not unique');
const monoExpected = new Set(['matrix', 'terminal', 'shades-of-grey', 'blueprint', 'minimal', 'sepia']);
for (const t of THEMES) if (t.mono !== monoExpected.has(t.id)) failures.push(`${t.name}: mono flag should be ${monoExpected.has(t.id)}`);

for (const t of THEMES) {
  const k = t.tokens;
  for (const key of TOKEN_KEYS) if (!k[key]) fail(t, `missing token ${key}`);
  for (const key of TOKEN_KEYS.filter((x) => !['tint', 'bgImage', 'bw', 'ring'].includes(x))) if (k[key] && !hex.test(k[key])) fail(t, `token ${key} is not a #rrggbb colour: ${k[key]}`);
  if (!['dark', 'light'].includes(t.scheme)) fail(t, 'scheme must be dark or light');
  if (!['Core', 'Dark', 'Light'].includes(t.group)) fail(t, 'unknown group');

  const hc = t.id === 'high-contrast';
  const core = t.group === 'Core';
  const textMin = hc ? CONTRAST.highContrastText : core ? CONTRAST.coreText : CONTRAST.relaxedFloor;
  const uiMin = hc ? CONTRAST.highContrastUi : core ? CONTRAST.coreUi : CONTRAST.relaxedFloor;

  const tintPct = parseFloat(k.tint) / 100;
  const tints = Object.fromEntries(STATE_KEYS.map((s) => [s, mix(k.surface, k[s], tintPct)]));
  const grounds = { bg: k.bg, surface: k.surface, surface2: k.surface2, ...Object.fromEntries(STATE_KEYS.map((s) => [`${s}-tint`, tints[s]])) };

  // Text pairs
  for (const fg of ['text', 'text2', 'text3']) {
    for (const [gn, gv] of Object.entries(grounds)) {
      const r = contrast(k[fg], gv);
      if (r < textMin) fail(t, `${fg} on ${gn} is ${r.toFixed(2)}:1, needs ${textMin}:1`);
      else if (!core && r < CONTRAST.relaxedTextWarn) warn(t, `${fg} on ${gn} is ${r.toFixed(2)}:1 (between ${CONTRAST.relaxedFloor}:1 and ${CONTRAST.relaxedTextWarn}:1)`);
    }
  }
  const ra = contrast(k.onAccent, k.accent);
  if (ra < textMin) fail(t, `onAccent on accent is ${ra.toFixed(2)}:1, needs ${textMin}:1`);
  else if (!core && ra < CONTRAST.relaxedTextWarn) warn(t, `onAccent on accent is ${ra.toFixed(2)}:1`);

  // Icons, gauges, state indicators, chart lines, focus ring
  const uiPairs = [];
  for (const g of ['bg', 'surface', 'surface2']) {
    uiPairs.push(['accent', k.accent, g, grounds[g]], ['focus', k.focus, g, grounds[g]]);
    for (const s of STATE_KEYS) uiPairs.push([s, k[s], g, grounds[g]]);
    for (const c of ['c1', 'c2', 'c3', 'c4']) uiPairs.push([c, k[c], g, grounds[g]]);
  }
  for (const s of STATE_KEYS) uiPairs.push([`${s} icon`, k[s], `its own tint`, tints[s]]);
  if (hc) uiPairs.push(['border', k.border, 'surface', k.surface]);
  for (const [name, fg, gn, bgc] of uiPairs) {
    const r = contrast(fg, bgc);
    if (r < uiMin) fail(t, `${name} on ${gn} is ${r.toFixed(2)}:1, needs ${uiMin}:1`);
  }

  // State separation
  if (!t.mono) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = STATE_KEYS[i], b = STATE_KEYS[j];
      const de = deltaE(k[a], k[b]);
      if (de < CONTRAST.stateDeltaE) fail(t, `${a} and ${b} look too alike (deltaE ${de.toFixed(1)}, needs ${CONTRAST.stateDeltaE})`);
      if (core) {
        const need = hc ? CONTRAST.highContrastCvdDeltaE : CONTRAST.coreCvdDeltaE;
        for (const type of CVD_TYPES) {
          const dc = deltaE(simulateCVD(k[a], type), simulateCVD(k[b], type));
          if (dc < need) fail(t, `${a} and ${b} merge under ${type} vision (deltaE ${dc.toFixed(1)}, needs ${need})`);
        }
      }
    }
    for (const s of ['alert', 'critical']) {
      const de = deltaE(k.accent, k[s]);
      if (de < CONTRAST.accentDeltaE) fail(t, `accent is too close to ${s} (deltaE ${de.toFixed(1)}, needs ${CONTRAST.accentDeltaE})`);
    }
  } else {
    // Mono: one hue, states ordered by lightness steps away from the surface, Critical most prominent
    const hues = STATE_KEYS.map((s) => rgb2hsl(k[s])).filter((h) => h.s > 0.08).map((h) => h.h);
    if (hues.length) {
      const spread = Math.max(...hues.map((h) => Math.min(...hues.map((o) => 0)) + Math.min(Math.abs(h - hues[0]), 360 - Math.abs(h - hues[0]))));
      if (spread > CONTRAST.monoHueSpread) fail(t, `mono state colours span ${spread.toFixed(0)} degrees of hue`);
    }
    const Ls = lightness(k.surface);
    const prom = STATE_KEYS.map((s) => Math.abs(lightness(k[s]) - Ls));
    for (let i = 1; i < 4; i++) {
      if (prom[i] - prom[i - 1] < CONTRAST.monoStepL) fail(t, `${STATE_KEYS[i]} is only ${(prom[i] - prom[i - 1]).toFixed(1)} L* steps from ${STATE_KEYS[i - 1]} (needs ${CONTRAST.monoStepL})`);
    }
    if (prom[3] !== Math.max(...prom)) fail(t, 'critical is not the most prominent state');
  }
}

console.log(`Checked ${THEMES.length} themes (${counts.Core} core, ${counts.Dark} dark, ${counts.Light} light).`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s) (Dark/Light text pairs near the floor, not failures):`);
  const byTheme = {};
  for (const w of warnings) { const name = w.split(':')[0]; (byTheme[name] ||= []).push(w); }
  for (const [name, ws] of Object.entries(byTheme)) console.log(`  ${name}: ${ws.length} pair(s); lowest: ${ws.map((w) => parseFloat(w.match(/([\d.]+):1/)[1])).sort((a, b) => a - b)[0]}:1`);
  if (process.argv.includes('--verbose')) warnings.forEach((w) => console.log('  - ' + w));
}
if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
console.log('\nAll themes pass their contrast targets.');
