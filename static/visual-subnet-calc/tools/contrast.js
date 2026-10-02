// Contrast checker for every theme in js/themes.js.
// Usage: node tools/contrast.js            (prints a Markdown report)
//        node tools/contrast.js --json     (machine-readable)
// It never edits themes.js. See README, "Theme contrast".
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../js/themes.js', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code + '\n;this.THEMES = THEMES;', sandbox);
const THEMES = sandbox.THEMES;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lin = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export function ratio(a, b) {
  const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// color-mix(in srgb, A pct%, B): plain interpolation of the sRGB channel values.
export function mix(a, pct, b) {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => (v * pct) / 100 + y[i] * (1 - pct / 100)));
}

export function checks(t) {
  const v = t.vars;
  const tint12 = mix(v['--accent'], 12, v['--surface']);
  const tint25 = mix(v['--accent'], 25, v['--surface']);
  const focus = v['--accent']; // --focus: var(--accent)
  return [
    ['--fg on --bg', v['--fg'], v['--bg'], 4.5],
    ['--fg on --surface', v['--fg'], v['--surface'], 4.5],
    ['--fg on --surface-2', v['--fg'], v['--surface-2'], 4.5],
    ['--fg-muted on --bg', v['--fg-muted'], v['--bg'], 4.5],
    ['--fg-muted on --surface', v['--fg-muted'], v['--surface'], 4.5],
    ['--fg-muted on --surface-2', v['--fg-muted'], v['--surface-2'], 4.5],
    ['--accent-fg on --accent', v['--accent-fg'], v['--accent'], 4.5],
    ['--danger on --bg', v['--danger'], v['--bg'], 4.5],
    ['--danger on --surface', v['--danger'], v['--surface'], 4.5],
    ['--accent (text) on --bg', v['--accent'], v['--bg'], 4.5],
    ['--accent (text) on --surface', v['--accent'], v['--surface'], 4.5],
    ['--focus on --bg', focus, v['--bg'], 3],
    ['--fg on bracket tint 12%', v['--fg'], tint12, 4.5],
    ['--fg on bracket tint 25% (hover/focus)', v['--fg'], tint25, 4.5],
    ['--fg on bracket tint 18% (what the app uses for hover/focus)', v['--fg'], mix(v['--accent'], 18, v['--surface']), 4.5],
    ['--accent bracket border vs --surface', v['--accent'], v['--surface'], 3],
  ].map(([name, fg, bg, min]) => ({ theme: t.id, name, fg, bg, min, ratio: ratio(fg, bg) }));
}

export function runAll() {
  return THEMES.flatMap(checks);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = runAll();
  const fails = all.filter((r) => r.ratio < r.min);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: all.length, failing: fails }, null, 2));
  } else {
    const byTheme = new Map();
    for (const f of fails) byTheme.set(f.theme, [...(byTheme.get(f.theme) ?? []), f]);
    console.log(`Checked ${THEMES.length} themes, ${all.length} pairs. ${fails.length} fail.\n`);
    console.log('| Theme | Pair | Colors | Ratio | Needs |');
    console.log('|---|---|---|---|---|');
    for (const [theme, list] of byTheme) {
      for (const f of list) {
        console.log(`| ${theme} | ${f.name} | ${f.fg} on ${f.bg} | ${f.ratio.toFixed(2)} | ${f.min}:1 |`);
      }
    }
    const clean = THEMES.filter((t) => !byTheme.has(t.id)).map((t) => t.id);
    console.log(`\nThemes with no failures (${clean.length}): ${clean.join(', ')}`);
  }
}
