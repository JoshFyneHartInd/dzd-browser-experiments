// Meters: one SVG shape per kind, so systems do not all look alike. Every meter:
//  - draws on a 100x100 viewBox, with the number (and a smaller unit under it) placed by a per-kind layout,
//  - carries level in its SHAPE (fill height, lit segments, needle angle), never only in colour,
//  - draws a "rail" of threshold bands using the same dash patterns as the original arc ring,
//  - is updated through updateMeter / setMeterText, whatever its kind.
// To add a kind: add an entry to KINDS (text layout, svg(), update()) and use its name as `meter:` on a channel in config.js.
import { bandIntervals } from './svg.js';

const DEG = Math.PI / 180;
export const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * DEG), cy + r * Math.sin(deg * DEG)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const f2 = (n) => n.toFixed(2);
export function arcPath(cx, cy, r, t0, t1, start = 135, sweep = 270) {
  const a0 = start + sweep * t0, a1 = start + sweep * t1;
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`;
}
const DASH = { healthy: '', caution: '2 3', alert: '6 3', critical: '' };
const WIDTH = { healthy: 3, caution: 4, alert: 5, critical: 7 };
const norm = (ch, b) => [(b.a - ch.min) / (ch.max - ch.min), (b.b - ch.min) / (ch.max - ch.min)];

/** Threshold bands as a ring around an arc. */
function ringBands(ch, cx, cy, r, start = 135, sweep = 270) {
  return bandIntervals(ch).map((b) => {
    const [t0, t1] = norm(ch, b);
    return `<path d="${arcPath(cx, cy, r, t0, t1, start, sweep)}" class="ring ring-${b.state}" stroke-dasharray="${DASH[b.state]}" stroke-width="${WIDTH[b.state]}" fill="none"/>`;
  }).join('');
}
/** Threshold bands as a straight rail from the point for the minimum to the point for the maximum. */
function rail(ch, x0, y0, x1, y1) {
  return bandIntervals(ch).map((b) => {
    const [t0, t1] = norm(ch, b);
    const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0, bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
    return `<line x1="${f2(ax)}" y1="${f2(ay)}" x2="${f2(bx)}" y2="${f2(by)}" class="ring ring-${b.state}" stroke-dasharray="${DASH[b.state]}" stroke-width="${f2(WIDTH[b.state] * 0.62)}" fill="none"/>`;
  }).join('');
}

let UID = 0;
const setSegs = (svg, n) => svg.querySelectorAll('.m-seg').forEach((el, i) => el.classList.toggle('on', i < n));
const segCount = (t, N) => (t == null || t <= 0 ? 0 : Math.min(N, Math.ceil(t * N - 1e-9)));

/** Shapes filled from the bottom: a rect, clipped to the shape, whose top edge follows the level. */
function setLevel(svg, t, yTop, yBot) {
  const r = svg.querySelector('.m-fill');
  const hgt = t == null ? 0 : (yBot - yTop) * t;
  r.setAttribute('y', f2(yBot - hgt)); r.setAttribute('height', f2(hgt));
}

const DROP = 'M50 4C50 4 16 42 16 64A34 34 0 0 0 84 64C84 42 50 4 50 4Z';
const SHIELD = 'M50 4L88 16V46C88 72 70 88 50 96C30 88 12 72 12 46V16Z';

const KINDS = {
  /* 270-degree dial with a continuous value arc (the original look) */
  arc: {
    text: { cx: 50, cy: 50, table: true },
    svg: (ch) => `<path d="${arcPath(50, 50, 33, 0, 1)}" class="arc-track" fill="none" stroke-width="7" stroke-linecap="round"/>
      <path class="arc-value" d="" fill="none" stroke-width="7" stroke-linecap="round"/><circle class="arc-dot" r="4.6"/>${ringBands(ch, 50, 50, 44)}`,
    update(svg, t) {
      const val = svg.querySelector('.arc-value'), dot = svg.querySelector('.arc-dot');
      if (t == null) { val.setAttribute('d', ''); dot.setAttribute('cx', -10); return; }
      val.setAttribute('d', t < 0.004 ? '' : arcPath(50, 50, 33, 0, t));
      const [x, y] = polar(50, 50, 33, 135 + 270 * t);
      dot.setAttribute('cx', f2(x)); dot.setAttribute('cy', f2(y));
    },
  },
  /* half dial with a needle */
  dial: {
    text: { cx: 50, cy: 80, maxw: 56, base: 20 },
    svg: (ch) => `<path d="${arcPath(50, 60, 31, 0, 1, 180, 180)}" class="arc-track" fill="none" stroke-width="7" stroke-linecap="round"/>
      <path class="arc-value" d="" fill="none" stroke-width="7" stroke-linecap="round"/>${ringBands(ch, 50, 60, 42, 180, 180)}
      <line class="m-needle" x1="50" y1="60" x2="50" y2="60" stroke-width="3.2" stroke-linecap="round"/><circle class="m-hub" cx="50" cy="60" r="5"/>`,
    update(svg, t) {
      const val = svg.querySelector('.arc-value'), n = svg.querySelector('.m-needle');
      const tt = t == null ? 0 : t;
      val.setAttribute('d', t == null || t < 0.004 ? '' : arcPath(50, 60, 31, 0, t, 180, 180));
      const [x, y] = polar(50, 60, 27, 180 + 180 * tt);
      n.setAttribute('x2', f2(x)); n.setAttribute('y2', f2(y));
      n.style.opacity = t == null ? 0.25 : 1;
    },
  },
  /* tall tank with a level and tick marks (Fuel) */
  tank: {
    text: { cx: 74, cy: 48, maxw: 38, base: 24 },
    svg(ch) {
      const id = `m${++UID}`;
      const ticks = [0.25, 0.5, 0.75].map((f) => `<line class="m-tick" x1="12" x2="${f === 0.5 ? 26 : 20}" y1="${f2(94 - 88 * f)}" y2="${f2(94 - 88 * f)}" stroke-width="1.6"/>`).join('');
      return `<clipPath id="${id}"><rect x="12" y="6" width="28" height="88" rx="7"/></clipPath>
        <rect class="m-well" x="12" y="6" width="28" height="88" rx="7"/>
        <rect class="m-fill" x="12" y="94" width="28" height="0" clip-path="url(#${id})"/>${ticks}
        <rect class="m-outline" x="12" y="6" width="28" height="88" rx="7"/>${rail(ch, 49, 94, 49, 6)}`;
    },
    update: (svg, t) => setLevel(svg, t, 6, 94),
  },
  /* depth ruler with a marker that slides down it (Ballast) */
  ruler: {
    text: { cx: 72, cy: 48, maxw: 40, base: 24 },
    svg(ch) {
      let ticks = '';
      for (let i = 0; i <= 8; i++) ticks += `<line class="m-axis" x1="24" x2="${24 + (i % 2 ? 6 : 12)}" y1="${f2(8 + 84 * i / 8)}" y2="${f2(8 + 84 * i / 8)}" stroke-width="2"/>`;
      return `<line class="m-axis" x1="24" x2="24" y1="8" y2="92" stroke-width="2.4"/>${ticks}
        <g class="m-marker"><path class="m-fill" d="M27 0L43 -8.5V8.5Z"/><line class="m-axis" x1="24" x2="28" y1="0" y2="0" stroke-width="3"/></g>${rail(ch, 11, 8, 11, 92)}`;
    },
    update(svg, t) {
      const g = svg.querySelector('.m-marker');
      g.setAttribute('transform', `translate(0 ${f2(8 + 84 * (t == null ? 0.5 : t))})`);
      g.style.opacity = t == null ? 0.25 : 1;
    },
  },
  /* battery cell with ten segments (Power) */
  cell: {
    text: { cx: 50, cy: 71, maxw: 84, base: 24 },
    svg(ch) {
      let segs = '';
      for (let i = 0; i < 10; i++) segs += `<rect class="m-seg" x="${f2(11 + i * 7.3)}" y="14" width="6" height="22" rx="1.6"/>`;
      return `<rect class="m-outline" x="6" y="9" width="82" height="32" rx="6"/><rect class="m-nub" x="88" y="18" width="6" height="14" rx="2"/>${segs}${rail(ch, 11, 51, 83, 51)}`;
    },
    update: (svg, t) => setSegs(svg, segCount(t, 10)),
  },
  /* stack of crates, filled from the bottom (Supplies) */
  crates: {
    text: { cx: 79, cy: 48, maxw: 34, base: 22 },
    svg(ch) {
      let segs = '';
      for (let i = 0; i < 12; i++) {
        const row = Math.floor(i / 3), col = i % 3, x = 8 + col * 15, y = 8 + (3 - row) * 21.5;
        segs += `<g><rect class="m-seg" x="${x}" y="${f2(y)}" width="12" height="17" rx="2"/><line class="m-tick" x1="${x + 2}" x2="${x + 10}" y1="${f2(y + 8.5)}" y2="${f2(y + 8.5)}" stroke-width="1.4"/></g>`;
      }
      return `${segs}${rail(ch, 56, 89.5, 56, 8)}`;
    },
    update: (svg, t) => svg.querySelectorAll('.m-seg').forEach((el, i) => el.classList.toggle('on', i < segCount(t, 12))),
  },
  /* five rising bars (Comms) */
  signal: {
    text: { cx: 50, cy: 77, maxw: 80, base: 18 },
    svg(ch) {
      let segs = '';
      for (let i = 0; i < 5; i++) { const hh = 10 + i * 8; segs += `<rect class="m-seg" x="${f2(9 + i * 18.4)}" y="${52 - hh}" width="13" height="${hh}" rx="2"/>`; }
      return `${segs}${rail(ch, 9, 59, 91, 59)}`;
    },
    update: (svg, t) => setSegs(svg, segCount(t, 5)),
  },
  /* droplet that fills from the bottom (Water) */
  drop: {
    text: { cx: 50, cy: 69, maxw: 44, base: 22, halo: true },
    svg(ch) {
      const id = `m${++UID}`;
      return `<clipPath id="${id}"><path d="${DROP}"/></clipPath><path class="m-well" d="${DROP}"/>
        <rect class="m-fill" x="0" y="98" width="100" height="0" clip-path="url(#${id})"/><path class="m-outline" d="${DROP}"/>${rail(ch, 94, 96, 94, 10)}`;
    },
    update: (svg, t) => setLevel(svg, t, 4, 98),
  },
  /* shield that fills from the bottom (Hull) */
  shield: {
    text: { cx: 50, cy: 50, maxw: 50, base: 24, halo: true },
    svg(ch) {
      const id = `m${++UID}`;
      return `<clipPath id="${id}"><path d="${SHIELD}"/></clipPath><path class="m-well" d="${SHIELD}"/>
        <rect class="m-fill" x="0" y="96" width="100" height="0" clip-path="url(#${id})"/><path class="m-outline" d="${SHIELD}"/>${rail(ch, 95, 94, 95, 8)}`;
    },
    update: (svg, t) => setLevel(svg, t, 4, 96),
  },
  /* round porthole that fills from the bottom (Waste) */
  porthole: {
    text: { cx: 50, cy: 52, maxw: 54, base: 24, halo: true },
    svg(ch) {
      const id = `m${++UID}`;
      return `<clipPath id="${id}"><circle cx="50" cy="50" r="38"/></clipPath><circle class="m-well" cx="50" cy="50" r="38"/>
        <rect class="m-fill" x="0" y="88" width="100" height="0" clip-path="url(#${id})"/><circle class="m-outline m-rim" cx="50" cy="50" r="40"/>${rail(ch, 96, 88, 96, 12)}`;
    },
    update: (svg, t) => setLevel(svg, t, 12, 88),
  },
  /* segmented donut (Airlock) */
  ring: {
    text: { cx: 50, cy: 50, maxw: 44, base: 22 },
    svg(ch) {
      let segs = '';
      for (let i = 0; i < 20; i++) segs += `<path class="m-seg m-seg-line" d="${arcPath(50, 50, 33, 0, 1, -90 + i * 18 + 2, 14)}" fill="none" stroke-width="9"/>`;
      return `${segs}${ringBands(ch, 50, 50, 45, -90, 359.9)}`;
    },
    update: (svg, t) => setSegs(svg, segCount(t, 20)),
  },
};

export const METER_KINDS = Object.keys(KINDS);

/** Markup for one meter. `cls` is added to the svg element; the number and unit live inside it. */
export function meterHTML(ch, kind = 'arc', cls = '') {
  const k = KINDS[kind] || KINDS.arc;
  const name = KINDS[kind] ? kind : 'arc';
  return `<svg class="meter meter-${name} ${k.text.halo ? 'm-halo' : ''} ${cls}" data-kind="${name}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${k.svg(ch)}
    ${k.text.halo ? '<rect class="m-chip" rx="5"/>' : ''}<text class="arc-num" x="${k.text.cx}" y="${k.text.cy}" text-anchor="middle" data-k="val">--</text><text class="arc-unit" x="${k.text.cx}" y="${k.text.cy + 14}" text-anchor="middle" data-k="unit"></text></svg>`;
}

export function updateMeter(svg, ch, value, state) {
  const k = KINDS[svg.dataset.kind];
  k.update(svg, value == null ? null : clamp01((value - ch.min) / (ch.max - ch.min)));
  svg.setAttribute('data-state', state);
}

/** Size the number to fit, centre its digits on the layout's centre point, and hang the unit beneath. */
export function setMeterText(svg, num, unit, noSig) {
  const L = KINDS[svg.dataset.kind].text;
  const n = svg.querySelector('.arc-num'), u = svg.querySelector('.arc-unit');
  if (n.textContent !== num) n.textContent = num;
  if (u.textContent !== unit) u.textContent = unit;
  const len = num.length;
  let size;
  if (noSig) size = Math.max(6, Math.min(9, (L.maxw || 46) / (0.66 * len)));
  else if (L.table) size = len <= 2 ? 24 : len === 3 ? 21 : len === 4 ? 18 : len === 5 ? 15 : 13;
  else size = Math.max(9, Math.min(L.base, L.maxw / (0.6 * len)));
  const base = L.cy + (size * 0.72) / 2; // digits are ~0.72em tall: centre them on cy
  const usize = unit.length > 5 ? 7.5 : 9;
  n.setAttribute('font-size', f2(size)); n.setAttribute('y', f2(base));
  u.setAttribute('font-size', usize); u.setAttribute('y', f2(base + usize * 0.72 + 3.2));
  n.classList.toggle('nosig', !!noSig);
  const chip = svg.querySelector('.m-chip'); // number sits on a chip when it overlaps a fill, so it stays readable
  if (chip) {
    const w = Math.max(len * size * 0.62, unit.length * usize * 0.6) + 8, top = base - size * 0.72 - 3.5, bot = unit ? base + usize * 0.72 + 3.2 + 3 : base + 3.5;
    chip.setAttribute('x', f2(L.cx - w / 2)); chip.setAttribute('y', f2(top)); chip.setAttribute('width', f2(w)); chip.setAttribute('height', f2(bot - top));
  }
}
