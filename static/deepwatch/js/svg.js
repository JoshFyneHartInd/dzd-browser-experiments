// SVG builders: state icons (distinct silhouettes), arc gauges, sparklines, trend charts with band patterns.
import { STATES, STATE_META } from './config.js';

/* State icons: circle+check, triangle, diamond, octagon+X. Shape differs, so state survives with colour removed. */
const GLYPH = {
  healthy: '<circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M7 12.4l3.3 3.3L17 8.9" fill="none" stroke="var(--surface)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  caution: '<path d="M12 2.2L22.6 20.6H1.4Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9v5.2" stroke="var(--surface)" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.5" fill="var(--surface)"/>',
  alert: '<path d="M12 1.2L22.8 12L12 22.8L1.2 12Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 6.8v6" stroke="var(--surface)" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.5" fill="var(--surface)"/>',
  critical: '<path d="M8 1.6h8l6.4 6.4v8L16 22.4H8L1.6 16V8Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="var(--surface)" stroke-width="2.7" stroke-linecap="round"/>',
};

export function stateIcon(state, size = 22, label) {
  const name = label || STATE_META[state].long;
  return `<svg class="state-icon state-${state}" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${name}"><title>${name}</title>${GLYPH[state]}</svg>`;
}
export const stateIconByIndex = (i, size, label) => stateIcon(STATES[i], size, label);

/** Hidden <defs> shared by every chart. Patterns differ by density, not just colour. */
export function patternDefs() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <pattern id="pat-healthy" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--healthy)" fill-opacity="0.06"/></pattern>
    <pattern id="pat-caution" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="var(--caution)" fill-opacity="0.10"/><line x1="0" y1="0" x2="0" y2="10" stroke="var(--caution)" stroke-width="1.4" stroke-opacity="0.75"/></pattern>
    <pattern id="pat-alert" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--alert)" fill-opacity="0.14"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--alert)" stroke-width="1.6" stroke-opacity="0.85"/></pattern>
    <pattern id="pat-critical" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--critical)" fill-opacity="0.18"/><path d="M0 0L6 6M6 0L0 6" stroke="var(--critical)" stroke-width="1.4" stroke-opacity="0.9"/></pattern>
  </defs></svg>`;
}

/* ---- Band geometry ---- */

/** Normalised [t0,t1] intervals for each state across the channel's full range. */
export function bandIntervals(ch) {
  if (!ch.bands) return [];
  const { min, max } = ch;
  const c = (v) => Math.min(max, Math.max(min, v));
  const { ok, caution, alert } = ch.bands;
  const out = [];
  const add = (state, a, b) => { a = c(a); b = c(b); if (b - a > 1e-9) out.push({ state, a, b }); };
  add('critical', min, alert[0]); add('critical', alert[1], max);
  add('alert', alert[0], caution[0]); add('alert', caution[1], alert[1]);
  add('caution', caution[0], ok[0]); add('caution', ok[1], caution[1]);
  add('healthy', ok[0], ok[1]);
  return out;
}

const DEG = Math.PI / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * DEG), cy + r * Math.sin(deg * DEG)];
function arcPath(cx, cy, r, t0, t1) {
  const a0 = 135 + 270 * t0, a1 = 135 + 270 * t1;
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const DASH = { healthy: '', caution: '2 3', alert: '6 3', critical: '' };
const WIDTH = { healthy: 3, caution: 4, alert: 5, critical: 7 };

/** Arc gauge skeleton: threshold ring (dash style differs per state), value arc, marker. */
export function arcGaugeHTML(ch, cls = '') {
  const segs = bandIntervals(ch).map((b) => {
    const t0 = (b.a - ch.min) / (ch.max - ch.min), t1 = (b.b - ch.min) / (ch.max - ch.min);
    return `<path d="${arcPath(50, 50, 44, t0, t1)}" class="ring ring-${b.state}" stroke-dasharray="${DASH[b.state]}" stroke-width="${WIDTH[b.state]}" fill="none"/>`;
  }).join('');
  return `<svg class="arc ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d="${arcPath(50, 50, 33, 0, 1)}" class="arc-track" fill="none" stroke-width="7" stroke-linecap="round"/>
    <path class="arc-value" d="" fill="none" stroke-width="7" stroke-linecap="round"/>
    <circle class="arc-dot" r="4.6"/>
    ${segs}
  </svg>`;
}
export function updateArc(svg, ch, value, state) {
  const val = svg.querySelector('.arc-value'), dot = svg.querySelector('.arc-dot');
  if (value == null) { val.setAttribute('d', ''); dot.setAttribute('cx', -10); return; }
  const t = Math.min(1, Math.max(0, (value - ch.min) / (ch.max - ch.min)));
  val.setAttribute('d', t < 0.004 ? '' : arcPath(50, 50, 33, 0, t));
  const [x, y] = polar(50, 50, 33, 135 + 270 * t);
  dot.setAttribute('cx', x.toFixed(2)); dot.setAttribute('cy', y.toFixed(2));
  svg.setAttribute('data-state', state);
}

/* ---- Sparkline and trend chart ---- */

function scaleFor(values, ch, pad = 0.12) {
  const v = values.filter((x) => x != null);
  if (!v.length) return { lo: ch.min, hi: ch.max };
  let lo = Math.min(...v), hi = Math.max(...v);
  const minSpan = (ch.max - ch.min) * 0.06;
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const p = (hi - lo) * pad;
  return { lo: lo - p, hi: hi + p };
}
function linePath(values, W, H, lo, hi, x0 = 0, yOff = 0) {
  const n = values.length;
  if (n < 2) return '';
  let d = '', pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    const x = x0 + (i / (n - 1)) * (W - x0), y = yOff + H - ((v - lo) / (hi - lo)) * H;
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

export function sparkline(values, ch, W = 120, H = 32) {
  const { lo, hi } = scaleFor(values, ch);
  const d = linePath(values, W, H - 4, lo, hi);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g transform="translate(0 2)"><path d="${d}" fill="none" class="spark-line" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></g></svg>`;
}

/** Larger chart with threshold bands drawn as distinct patterns. */
export function trendChart(values, ch, { W = 520, H = 150, label = '' } = {}) {
  const L = 44, B = 18, plotW = W - L - 6, plotH = H - B - 6;
  let { lo, hi } = scaleFor(values, ch, 0.15);
  if (ch.bands) {
    // pull the healthy band into view so thresholds are always visible
    const ok = ch.bands.ok;
    const okLo = isFinite(ok[0]) ? ok[0] : lo, okHi = isFinite(ok[1]) ? ok[1] : hi;
    const span = Math.max(okHi - okLo, (ch.max - ch.min) * 0.1);
    lo = Math.min(lo, okLo - span * 0.25); hi = Math.max(hi, okHi + span * 0.25);
  }
  const y = (v) => 3 + plotH - ((v - lo) / (hi - lo)) * plotH;
  const bands = bandIntervals(ch).map((b) => {
    const a = Math.max(lo, b.a), c = Math.min(hi, b.b);
    if (c <= a) return '';
    return `<rect x="${L}" y="${y(c).toFixed(1)}" width="${plotW}" height="${(y(a) - y(c)).toFixed(1)}" fill="url(#pat-${b.state})"/>`;
  }).join('');
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) =>
    `<text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" class="chart-axis">${fmtTick(v, ch)}</text><line x1="${L}" x2="${L + plotW}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="chart-grid"/>`).join('');
  const n = values.length;
  const mins = Math.round((n * 5) / 60);
  const path = linePath(values, W - 6, plotH, lo, hi, L, 3);
  const last = [...values].reverse().find((v) => v != null);
  const dot = last != null && n > 1 ? `<circle cx="${W - 6}" cy="${y(last).toFixed(1)}" r="3.6" class="chart-dot"/>` : '';
  const gaps = values.some((v) => v == null) ? '<text x="' + (L + 6) + '" y="14" class="chart-axis">gaps = no signal</text>' : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} trend, last ${mins || 1} minutes">${bands}${ticks}
    <path d="${path}" fill="none" class="chart-line" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dot}${gaps}
    <text x="${L}" y="${H - 3}" class="chart-axis">${mins ? '-' + mins + ' min' : ''}</text><text x="${W - 6}" y="${H - 3}" text-anchor="end" class="chart-axis">now</text></svg>`;
}
function fmtTick(v, ch) {
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(Math.max(0, ch.dec));
}
