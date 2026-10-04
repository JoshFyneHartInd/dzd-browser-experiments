// Control widgets. They change how a control LOOKS and FEELS, never how it behaves: every fader widget feeds the same
// set-point / lag / overshoot model, so a knob, a step selector and a slider are interchangeable for the simulation.
//
// Fader widget contract: { el, focusEl, onInput(v), onCommit(v), set(v), actual(f 0..1), aria(text) }
//   onInput fires while changing (drag, key press); onCommit fires when the change is finished.
// Toggle widget contract: { el, btn }  (btn is the role="switch" element the caller keeps in sync)
import { h } from './dom.js';
import { arcPath, polar } from './meters.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const snap = (spec, v) => clamp(Math.round((v - spec.min) / (spec.step || 1)) * (spec.step || 1) + spec.min, spec.min, spec.max);
const frac = (spec, v) => (v - spec.min) / (spec.max - spec.min);
const SVGNS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ faders */

/** Plain horizontal slider. */
export function sliderWidget(spec, id, value) {
  const input = h('input', { type: 'range', id, min: spec.min, max: spec.max, step: spec.step, value });
  const ghost = h('span', { class: 'fader-ghost', 'aria-hidden': 'true', title: 'Actual value' });
  const el = h('div', { class: 'fader' }, input, ghost);
  const w = {
    el, focusEl: input, labelFor: id, onInput() {}, onCommit() {},
    set(v) { if (document.activeElement !== input && +input.value !== v) input.value = v; },
    actual(f) { el.style.setProperty('--f', f.toFixed(4)); },
    aria(t) { input.setAttribute('aria-valuetext', t); },
  };
  input.addEventListener('input', () => w.onInput(+input.value));
  input.addEventListener('change', () => w.onCommit(+input.value));
  return w;
}

/** Vertical slider (a horizontal range input turned on its side, so keyboard and touch behave natively). */
export function vsliderWidget(spec, id, value) {
  const input = h('input', { type: 'range', id, min: spec.min, max: spec.max, step: spec.step, value });
  const ghost = h('span', { class: 'fader-ghost', 'aria-hidden': 'true', title: 'Actual value' });
  const body = h('div', { class: 'vfader' }, h('div', { class: 'fader vfader-rot' }, input), ghost);
  const ends = spec.ends || [];
  const scale = h('div', { class: 'vfader-scale', 'aria-hidden': 'true' },
    h('span', { text: ends[0] || String(spec.max) }), spec.mid ? h('span', { class: 'mid', text: spec.mid }) : null, h('span', { text: ends[1] || String(spec.min) }));
  const el = h('div', { class: 'vfader-wrap' }, body, scale);
  const w = {
    el, focusEl: input, labelFor: id, onInput() {}, onCommit() {},
    set(v) { if (document.activeElement !== input && +input.value !== v) input.value = v; },
    actual(f) { body.style.setProperty('--f', f.toFixed(4)); },
    aria(t) { input.setAttribute('aria-valuetext', t); },
  };
  input.addEventListener('input', () => w.onInput(+input.value));
  input.addEventListener('change', () => w.onCommit(+input.value));
  return w;
}

/** Rotary knob or valve handwheel: drag around it, or use the arrow keys. A small pip on the rim shows the ACTUAL position. */
export function knobWidget(spec, id, value) {
  const valve = spec.skin === 'valve';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', `knob knob-${valve ? 'valve' : 'dial'}`);
  svg.setAttribute('role', 'slider');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('id', id);
  svg.setAttribute('aria-valuemin', spec.min); svg.setAttribute('aria-valuemax', spec.max);
  const spokes = [0, 60, 120].map((a) => `<line x1="50" y1="${50 - 30}" x2="50" y2="${50 + 30}" transform="rotate(${a} 50 50)" class="k-spoke" stroke-width="5" stroke-linecap="round"/>`).join('');
  let ticks = '';
  for (let i = 0; i <= 10; i++) { const [x0, y0] = polar(50, 50, 47, 135 + 27 * i), [x1, y1] = polar(50, 50, i % 5 ? 49.5 : 52, 135 + 27 * i); ticks += `<line class="k-tick" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${i % 5 ? 1.2 : 2}"/>`; }
  svg.innerHTML = `${ticks}<path class="k-track" d="${arcPath(50, 50, 42, 0, 1)}" fill="none" stroke-width="5" stroke-linecap="round"/>
    <path class="k-value" d="" fill="none" stroke-width="5" stroke-linecap="round"/>
    <g class="k-rot">${valve
    ? `<circle cx="50" cy="50" r="30" class="k-rim" fill="none" stroke-width="7"/>${spokes}<circle cx="50" cy="50" r="7" class="k-hub"/><path class="k-pointer" d="M50 14l5 9h-10z"/>`
    : `<circle cx="50" cy="50" r="30" class="k-body"/><line x1="50" y1="24" x2="50" y2="38" class="k-pointer-line" stroke-width="5" stroke-linecap="round"/>`}</g>
    <circle class="k-ghost" r="4.2"/>`;
  const rot = svg.querySelector('.k-rot'), val = svg.querySelector('.k-value'), ghost = svg.querySelector('.k-ghost');
  let cur = value, dragging = false;

  const render = () => {
    const f = frac(spec, cur);
    rot.setAttribute('transform', `rotate(${(-135 + 270 * f).toFixed(1)} 50 50)`);
    val.setAttribute('d', f < 0.004 ? '' : arcPath(50, 50, 42, 0, f));
    svg.setAttribute('aria-valuenow', cur);
  };
  const w = {
    el: h('div', { class: 'knob-wrap' }, svg), focusEl: svg, labelFor: null, onInput() {}, onCommit() {},
    set(v) { if (!dragging && v !== cur) { cur = v; render(); } },
    actual(f) { const [x, y] = polar(50, 50, 42, 135 + 270 * f); ghost.setAttribute('cx', x.toFixed(2)); ghost.setAttribute('cy', y.toFixed(2)); },
    aria(t) { svg.setAttribute('aria-valuetext', t); },
  };
  const change = (v) => { v = snap(spec, v); if (v === cur) return; cur = v; render(); w.onInput(v); };
  const fromPointer = (e) => {
    const r = svg.getBoundingClientRect();
    let deg = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI; // 0 = top, clockwise +
    if (deg > 135 || deg < -135) deg = frac(spec, cur) >= 0.5 ? 135 : -135; // dead zone at the bottom: stick to the nearer end
    change(spec.min + ((deg + 135) / 270) * (spec.max - spec.min));
  };
  svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); svg.focus(); fromPointer(e); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const end = () => { if (dragging) { dragging = false; w.onCommit(cur); } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  let keyed = false;
  svg.addEventListener('keydown', (e) => {
    const st = spec.step || 1, big = (spec.max - spec.min) / 10;
    const d = { ArrowRight: st, ArrowUp: st, ArrowLeft: -st, ArrowDown: -st, PageUp: big, PageDown: -big }[e.key];
    if (d != null) { e.preventDefault(); keyed = true; change(cur + d); }
    else if (e.key === 'Home') { e.preventDefault(); keyed = true; change(spec.min); }
    else if (e.key === 'End') { e.preventDefault(); keyed = true; change(spec.max); }
  });
  svg.addEventListener('keyup', () => { if (keyed) { keyed = false; w.onCommit(cur); } });
  render();
  return w;
}

/** A row of labelled detents (Off / Low / High ...). Choosing one sets its value; the ACTUAL position shows as a marker. */
export function stepsWidget(spec, id, value) {
  const stops = spec.stops;
  const near = (v) => stops.reduce((bi, s, i) => (Math.abs(s.v - v) < Math.abs(stops[bi].v - v) ? i : bi), 0);
  const btns = stops.map((s, i) => h('button', { type: 'button', class: 'step', role: 'radio', 'aria-checked': 'false', tabindex: '-1', 'data-v': s.v },
    h('span', { class: 'step-label', text: s.label }), h('span', { class: 'step-val', text: `${s.v}${spec.unit || ''}` }), h('span', { class: 'step-actual', 'aria-hidden': 'true' })));
  const el = h('div', { class: 'steps', role: 'radiogroup', style: `--n:${stops.length}` }, btns);
  let sel = near(value);
  const render = () => btns.forEach((b, i) => { b.setAttribute('aria-checked', String(i === sel)); b.tabIndex = i === sel ? 0 : -1; });
  const w = {
    el, focusEl: el, labelFor: null, onInput() {}, onCommit() {},
    set(v) { const i = near(v); if (i !== sel) { sel = i; render(); } },
    actual(f) { const i = near(spec.min + f * (spec.max - spec.min)); btns.forEach((b, j) => b.classList.toggle('is-actual', j === i)); },
    aria() {},
  };
  const pick = (i, focus) => { sel = clamp(i, 0, stops.length - 1); render(); if (focus) btns[sel].focus(); w.onInput(stops[sel].v); w.onCommit(stops[sel].v); };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => pick(i));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); pick(sel + d, true); }
    });
  });
  render();
  return w;
}

export const FADER_WIDGETS = { slider: sliderWidget, vslider: vsliderWidget, knob: knobWidget, steps: stepsWidget };

/* ----------------------------------------------------------------- toggles */

const sw = (id, extra = '') => h('button', { class: `switch ${extra}`, type: 'button', role: 'switch', id, 'aria-checked': 'false' }, h('span', { class: 'switch-knob' }), h('span', { class: 'switch-text' }));

export function switchToggle(spec, id) { const btn = sw(id); return { el: btn, btn }; }

/** Vertical lever: up is ON, down is OFF. */
export function leverToggle(spec, id) {
  const btn = h('button', { class: 'lever', type: 'button', role: 'switch', id, 'aria-checked': 'false' },
    h('span', { class: 'lever-slot', 'aria-hidden': 'true' }, h('span', { class: 'lever-handle' })), h('span', { class: 'switch-text' }));
  return { el: btn, btn };
}

/** Switch under a hinged cover. Lifting the cover is required to switch ON (the risky direction); switching OFF is always free. */
export function guardedToggle(spec, id) {
  const btn = sw(id);
  const cover = h('button', { class: 'guard-cover', type: 'button', 'aria-label': `Lift cover to arm ${spec.label}` }, h('span', { class: 'guard-text', text: 'Lift cover' }));
  const el = h('div', { class: 'guard' }, btn, cover);
  let armed = false, timer = 0, on = false;
  const sync = () => {
    const locked = !on && !armed;
    el.classList.toggle('is-armed', armed);
    el.classList.toggle('is-locked', locked);
    btn.setAttribute('aria-disabled', String(locked));
    btn.tabIndex = locked ? -1 : 0;
    cover.hidden = !locked;
  };
  const arm = (a) => { armed = a; clearTimeout(timer); if (a) timer = setTimeout(() => { armed = false; sync(); }, 5000); sync(); };
  cover.addEventListener('click', () => { arm(true); btn.focus(); });
  const w = { el, btn, onUserToggle() { arm(false); }, locked: () => !on && !armed, sync: (isOn) => { on = isOn; if (isOn) { armed = false; clearTimeout(timer); } sync(); } };
  sync();
  return w;
}

export const TOGGLE_WIDGETS = { switch: switchToggle, lever: leverToggle, guarded: guardedToggle };
