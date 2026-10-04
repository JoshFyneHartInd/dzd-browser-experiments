// System detail screen: readouts, trend charts, linked readouts, controls with pending indicators, wear, recent events.
import { CONFIG, STATES, STATE_META, SYSTEM_BY_ID, SENSOR_SYSTEMS } from './config.js';
import { formatValue, stateIndex, setControl, controlPending, jobInfo, startJob } from './sim.js';
import { h, setText, setAttr, setClass, ph, clockText } from './dom.js';
import { stateIcon, trendChart } from './svg.js';
import { meterHTML, updateMeter, setMeterText } from './meters.js';
import { fmtClock } from './util.js';
import { FADER_WIDGETS, TOGGLE_WIDGETS, sliderWidget } from './widgets.js';
import * as audio from './audio.js';

const uid = () => Math.random().toString(36).slice(2, 7);

function fmtCtl(spec, v) {
  if (spec.id === 'tanks') {
    const d = Math.round(v - 50);
    return d === 0 ? 'Neutral' : d < 0 ? `Fill ${-d}` : `Vent ${d}`;
  }
  if (spec.stops) return spec.stops.reduce((b, s) => (Math.abs(s.v - v) < Math.abs(b.v - v) ? s : b)).label;
  return `${Math.round(v)}${spec.unit || ''}`;
}

export function installDetail(ui) {
  Object.assign(ui, { openDetail, closeDetail, handleEscape, buildDetail, updateDetail, buildControl, buildFader, buildToggle, buildJob, buildSensorTable });
}

function handleEscape() {
  if (this.app.menu && this.app.menu.isOpen()) { this.app.menu.close(); return true; }
  if (this.logOpen) { this.setLogOpen(false); return true; }
  if (this.detailSys) { this.closeDetail(); return true; }
  return false;
}

function openDetail(sysId) {
  this.detailSys = sysId;
  this.dash.hidden = true;
  this.detail.hidden = false;
  this.root.classList.add('detail-open');
  this.buildDetail(SYSTEM_BY_ID[sysId]);
  this.updateDetail(this.sim, true);
  const back = this.detail.querySelector('[data-k="back"]');
  if (back) back.focus({ preventScroll: true });
  audio.click();
}

function closeDetail() {
  const prev = this.detailSys;
  this.detailSys = null;
  this.dv = null;
  this.detail.hidden = true;
  this.detail.innerHTML = '';
  this.dash.hidden = false;
  this.root.classList.remove('detail-open');
  const tile = prev && this.tiles[prev];
  if (tile) tile.el.focus({ preventScroll: true });
}

function buildDetail(sd) {
  const d = this.detail;
  d.innerHTML = '';
  const dv = (this.dv = { sd, readouts: {}, charts: {}, ctls: [], strip: {}, links: [], last: {} });

  // Slim strip: the dashboard stays visible while a system is open
  const strip = h('nav', { class: 'strip', 'aria-label': 'All systems' });
  for (const s of CONFIG.systems) {
    const b = h('button', { class: 'strip-item', type: 'button', 'data-sys': s.id, 'data-state': 'healthy' });
    b.innerHTML = `${ph(s.icon, 'strip-icon')}<span class="strip-name">${s.name}</span><span class="strip-state" data-k="st"></span><span class="strip-val" data-k="v"></span>`;
    b.onclick = () => { if (s.id !== this.detailSys) { this.detailSys = s.id; this.buildDetail(s); this.updateDetail(this.sim, true); } };
    dv.strip[s.id] = { el: b, st: b.querySelector('[data-k="st"]'), v: b.querySelector('[data-k="v"]'), last: '' };
    strip.append(b);
  }

  const main = h('div', { class: 'detail-main' });
  const head = h('div', { class: 'detail-head' });
  head.innerHTML = `<button class="btn back" data-k="back" type="button">${ph('arrow-left')} Back</button>
    ${ph(sd.icon, 'detail-icon')}<h2>${sd.name}</h2><span class="detail-state" data-k="state"></span>`;
  head.querySelector('[data-k="back"]').onclick = () => this.closeDetail();
  dv.stateEl = head.querySelector('[data-k="state"]');

  const left = h('div', { class: 'col-left' });
  const readouts = h('div', { class: 'readouts' });
  for (const ch of sd.channels) {
    const card = h('div', { class: 'card', 'data-ch': ch.id });
    const round = !ch.text && ch.bands; // numeric channels with bands get the big centred-value gauge
    const gauge = round ? meterHTML(ch, ch.meter, 'card-arc') : ch.text ? '' : `<div class="bar" aria-hidden="true"><i></i></div>`;
    card.innerHTML = `<div class="card-top"><span class="card-label">${ch.label}</span><span class="card-badge" data-k="badge"></span></div>
      <div class="card-body ${round ? 'card-body-gauge' : ch.text ? '' : 'card-body-bar'}">${gauge}${round ? '' : `<div class="card-val"><span class="val" data-k="val">--</span><span class="unit" data-k="unit">${ch.unit || ''}</span></div>`}</div>
      <div class="card-true" data-k="true" hidden></div>`;
    dv.readouts[ch.id] = { ch, el: card, k: (k) => card.querySelector(`[data-k="${k}"]`), arc: card.querySelector('.meter'), round, bar: card.querySelector('.bar i'), last: '' };
    readouts.append(card);
  }
  const charts = h('div', { class: 'charts' });
  const chartChans = [...sd.channels.filter((c) => !c.text)].sort((a, b) => (b.id === sd.primary) - (a.id === sd.primary)).slice(0, 4);
  for (const ch of chartChans) {
    const c = h('figure', { class: 'chart-card' }, h('figcaption', { text: `${ch.label}${ch.unit ? ' (' + ch.unit + ')' : ''}` }));
    const holder = h('div', { class: 'chart-holder' });
    c.append(holder);
    dv.charts[ch.id] = { ch, holder, sig: '' };
    charts.append(c);
  }
  left.append(readouts, charts);

  const right = h('div', { class: 'col-right' });
  const controls = h('section', { class: 'controls', 'aria-label': `${sd.name} controls` });
  controls.append(h('h3', { text: 'Controls' }));
  const maint = sd.controls.find((c) => c.id === 'maint');
  if (sd.id === 'instruments') controls.append(this.buildSensorTable());
  for (const spec of sd.controls) if (spec.id !== 'maint') controls.append(this.buildControl(sd, spec));
  if (maint) controls.append(h('h3', { class: 'sub', text: 'Maintenance' }), this.buildControl(sd, maint)); // not every system has equipment to service

  const links = h('section', { class: 'links', 'aria-label': 'Linked systems' }, h('h3', { text: 'Linked systems' }));
  const lrow = h('div', { class: 'link-row' });
  for (const [ls, lc] of sd.links) {
    const lsd = SYSTEM_BY_ID[ls], lch = lsd.channels.find((c) => c.id === lc);
    const b = h('button', { class: 'link-chip', type: 'button' });
    b.innerHTML = `${ph(lsd.icon)}<span class="link-name">${lsd.name} <small>${lch.label}</small></span><span class="link-val" data-k="v"></span><span data-k="st"></span>`;
    b.onclick = () => { this.detailSys = ls; this.buildDetail(lsd); this.updateDetail(this.sim, true); };
    dv.links.push({ ls, lc, lch, el: b, v: b.querySelector('[data-k="v"]'), st: b.querySelector('[data-k="st"]'), last: '' });
    lrow.append(b);
  }
  links.append(lrow);

  const wear = h('section', { class: 'wear', 'aria-label': 'Wear' });
  wear.innerHTML = `<h3>Wear</h3><div class="wear-row"><div class="wearbar" role="progressbar" aria-label="${sd.name} wear" aria-valuemin="0" aria-valuemax="100"><i></i></div><span data-k="wearv"></span></div>
    <p class="hint">Wear rises with stress and time out of band. High wear raises drift, failures and gauge error.${maint ? ' Maintenance lowers it.' : ''}</p>`;
  dv.wearBar = wear.querySelector('.wearbar');
  dv.wearFill = wear.querySelector('.wearbar i');
  dv.wearText = wear.querySelector('[data-k="wearv"]');

  const recent = h('section', { class: 'recent', 'aria-label': 'Recent events' }, h('h3', { text: 'Recent events' }));
  dv.recentList = h('ul', { class: 'recent-list' });
  recent.append(dv.recentList);

  right.append(controls, links, wear, recent);
  main.append(head, h('div', { class: 'detail-grid' }, left, right));
  d.append(strip, main);
}

/* ---------------------------------------------------------------- controls */

function buildControl(sd, spec) {
  const c = spec.type === 'fader' ? this.buildFader(sd, spec) : spec.type === 'toggle' ? this.buildToggle(sd, spec) : this.buildJob(sd, spec);
  this.dv.ctls.push(c);
  return c.el;
}

function pendingChip(text) {
  return h('div', { class: 'ctl-pending', hidden: true, 'aria-live': 'polite' },
    h('span', { class: 'pend-glyph', html: ph('hourglass-medium') }), h('span', { class: 'pend-text', text }), h('span', { class: 'pbar' }, h('i')));
}

function buildFader(sd, spec) {
  const ui = this, key = `${sd.id}.${spec.id}`, id = `f-${uid()}`;
  const wrap = h('div', { class: `ctl ctl-fader ctl-${spec.ui || 'slider'}`, 'data-ctl': spec.id });
  const w = (FADER_WIDGETS[spec.ui] || sliderWidget)(spec, id, this.sim.ctl[key].set);
  w.focusEl.setAttribute('aria-describedby', id + '-h');
  const lab = h('label', { id: id + '-l', for: w.labelFor, text: spec.label });
  if (!w.labelFor) w.focusEl.setAttribute('aria-labelledby', id + '-l');
  const setEl = h('b'), nowEl = h('b');
  const pend = pendingChip('Pending change');
  wrap.append(
    h('div', { class: 'ctl-head' }, lab, h('span', { class: 'ctl-vals' }, 'Set ', setEl, ' · Actual ', nowEl)),
    w.el, pend, h('p', { class: 'hint', id: id + '-h', text: spec.hint || '' }));
  let lastTick = 0, start = this.sim.ctl[key].eff;
  w.onInput = (v) => {
    start = ui.sim.ctl[key].eff;
    setControl(ui.sim, sd.id, spec.id, v);
    const now = performance.now();
    if (now - lastTick > 70) { lastTick = now; audio.tick(); }
  };
  w.onCommit = (v) => setControl(ui.sim, sd.id, spec.id, v, { log: true });
  const last = {};
  return {
    el: wrap,
    update(sim) {
      const c = sim.ctl[key], f = (c.eff - spec.min) / (spec.max - spec.min);
      if (last.f !== f) { last.f = f; w.actual(clampF(f)); }
      setText(setEl, fmtCtl(spec, c.set));
      setText(nowEl, fmtCtl(spec, c.eff));
      w.set(c.set);
      w.aria(fmtCtl(spec, c.set));
      const p = controlPending(sim, sd.id, spec.id);
      pend.hidden = !p.pending;
      if (p.pending) {
        const total = Math.max(1e-6, Math.abs(c.set - start));
        const prog = Math.max(0, Math.min(1, 1 - Math.abs(c.set - c.eff) / Math.max(total, Math.abs(c.set - c.eff))));
        pend.querySelector('.pend-text').textContent = `Pending change: moving from ${fmtCtl(spec, c.eff)} toward ${fmtCtl(spec, c.set)}`;
        pend.querySelector('.pbar i').style.width = `${(prog * 100).toFixed(0)}%`;
      }
      const overshoot = c.eff > Math.max(c.set, start) + 0.5 * spec.step || c.eff < Math.min(c.set, start) - 0.5 * spec.step;
      setClass(wrap, 'overshooting', overshoot);
    },
  };
}
const clampF = (f) => Math.max(0, Math.min(1, f));

function buildToggle(sd, spec) {
  const ui = this, key = `${sd.id}.${spec.id}`, id = `t-${uid()}`;
  const tw = (TOGGLE_WIDGETS[spec.ui] || TOGGLE_WIDGETS.switch)(spec, id);
  const btn = tw.btn;
  btn.setAttribute('aria-describedby', id + '-h');
  const wrap = h('div', { class: `ctl ctl-toggle ctl-${spec.ui || 'switch'}`, 'data-ctl': spec.id });
  const pend = pendingChip('Pending change');
  wrap.append(h('div', { class: 'ctl-head' }, h('label', { for: id, text: spec.label }), tw.el), pend, h('p', { class: 'hint', id: id + '-h', text: spec.hint || '' }));
  btn.onclick = () => {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    const sim = ui.sim;
    setControl(sim, sd.id, spec.id, sim.ctl[key].set ? 0 : 1, { log: true });
    if (tw.onUserToggle) tw.onUserToggle();
    audio.click();
  };
  return {
    el: wrap,
    update(sim) {
      const c = sim.ctl[key], on = c.set === 1;
      setAttr(btn, 'aria-checked', on);
      setText(btn.querySelector('.switch-text'), on ? 'ON' : 'OFF');
      if (tw.sync) tw.sync(on);
      const p = controlPending(sim, sd.id, spec.id);
      pend.hidden = !p.pending;
      if (p.pending) {
        pend.querySelector('.pend-text').textContent = on ? 'Pending change: switching on' : 'Pending change: switching off';
        pend.querySelector('.pbar i').style.width = `${(Math.abs(c.eff - (on ? 0 : 1)) * 100).toFixed(0)}%`;
      }
    },
  };
}

function jobButtonState(btn, info, label) {
  const sub = btn.querySelector('.job-sub'), bar = btn.querySelector('.job-bar');
  setText(btn.querySelector('.job-label'), label);
  btn.setAttribute('aria-disabled', info.canStart ? 'false' : 'true');
  btn.classList.toggle('is-busy', info.active);
  if (btn._armed && info.canStart) { setText(sub, 'Press again to confirm'); bar.style.width = '0%'; return; }
  if (info.active) { setText(sub, `In progress, about ${fmtClock(info.secLeft)} left`); bar.style.width = `${(info.progress * 100).toFixed(0)}%`; }
  else if (info.cooling) { setText(sub, `Ready in ${fmtClock(info.secLeft)}`); bar.style.width = '0%'; }
  else if (info.reason) { setText(sub, info.reason); bar.style.width = '0%'; }
  else { setText(sub, costText(info.spec)); bar.style.width = '0%'; }
}
const costText = (spec) => (spec.cost && spec.cost.spares ? `Uses ${spec.cost.spares} spare` : 'Ready');

/** opts.arm: a two-step button. The first press arms it for a few seconds, the second press starts the job. */
function jobButton(ui, key, label, onDone, opts = {}) {
  const btn = h('button', { class: 'btn job', type: 'button' }, h('span', { class: 'job-bar', 'aria-hidden': 'true' }), h('span', { class: 'job-label' }), h('span', { class: 'job-sub' }));
  let timer = 0;
  const disarm = () => { clearTimeout(timer); btn._armed = false; btn.classList.remove('is-armed'); };
  btn.onclick = () => {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    if (opts.arm && !btn._armed) {
      btn._armed = true; btn.classList.add('is-armed'); audio.click();
      setText(btn.querySelector('.job-sub'), 'Press again to confirm');
      timer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    if (startJob(ui.sim, key)) { audio.confirm(); if (onDone) onDone(); }
  };
  return btn;
}

function buildJob(sd, spec) {
  const key = `${sd.id}.${spec.id}`, id = `j-${uid()}`;
  const wrap = h('div', { class: `ctl ctl-job ${spec.ui === 'arm' ? 'ctl-arm' : ''}`, 'data-ctl': spec.id });
  const btn = jobButton(this, key, spec.label, null, { arm: spec.ui === 'arm' });
  btn.setAttribute('aria-describedby', id + '-h');
  wrap.append(btn, h('p', { class: 'hint', id: id + '-h', text: spec.hint || '' }));
  return { el: wrap, update(sim) { jobButtonState(btn, jobInfo(sim, key), spec.label); } };
}

function buildSensorTable() {
  const ui = this;
  const table = h('div', { class: 'sensor-table', role: 'table', 'aria-label': 'Per-sensor health' });
  table.append(h('div', { class: 'sensor-row sensor-head', role: 'row' }, h('span', { text: 'Gauge' }), h('span', { text: 'Health' }), h('span', { text: 'Cal. error' }), h('span', { text: 'Actions' })));
  const rows = [];
  for (const s of SENSOR_SYSTEMS) {
    const sd = SYSTEM_BY_ID[s];
    const recal = jobButton(this, `instruments.recal.${s}`, 'Recalibrate');
    const swap = jobButton(this, `instruments.swap.${s}`, 'Swap');
    recal.classList.add('small'); swap.classList.add('small');
    const hb = h('div', { class: 'wearbar', role: 'progressbar', 'aria-label': `${sd.name} gauge health`, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
    const hv = h('span', { class: 'sv' }), ev = h('span', { class: 'sv' });
    const row = h('div', { class: 'sensor-row', role: 'row' },
      h('span', { class: 'sname', html: `${ph(sd.icon)} ${sd.name}` }), h('span', { class: 'shealth' }, hb, hv), ev, h('span', { class: 'sact' }, recal, swap));
    rows.push({ s, hb, hv, ev, recal, swap, row });
    table.append(row);
  }
  this.dv.ctls.push({
    el: table,
    update(sim) {
      for (const r of rows) {
        const sn = sim.sensors[r.s], health = sn.health;
        const err = (Math.abs(sn.bias) + Math.max(0, ...Object.values(sn.offsets).map(Math.abs))) * 100;
        const word = health >= 60 ? 'OK' : health >= 40 ? 'Degraded' : 'Poor';
        setText(r.hv, `${Math.round(health)}% ${word}`);
        setText(r.ev, `${err.toFixed(1)}%`);
        r.hb.querySelector('i').style.width = `${health.toFixed(0)}%`;
        setAttr(r.hb, 'aria-valuenow', Math.round(health));
        setClass(r.row, 'poor', health < 40);
        jobButtonState(r.recal, jobInfo(sim, `instruments.recal.${r.s}`), 'Recalibrate');
        jobButtonState(r.swap, jobInfo(sim, `instruments.swap.${r.s}`), 'Swap');
      }
    },
  });
  return table;
}

/* ------------------------------------------------------------------ update */

function updateDetail(sim, force = false) {
  const dv = this.dv;
  if (!dv) return;
  const { sd } = dv;
  const st = sim.st[sd.id], state = STATES[st.s];
  if (dv.last.state !== state || force) {
    dv.last.state = state;
    dv.stateEl.innerHTML = `${stateIcon(state, 28)}<span>${STATE_META[state].long}</span>`;
    dv.stateEl.dataset.state = state;
  }
  for (const ch of sd.channels) {
    const r = dv.readouts[ch.id], v = sim.shown[sd.id][ch.id];
    const text = v == null ? 'NO SIGNAL' : formatValue(ch, v);
    const cs = v == null ? -1 : stateIndex(ch, v);
    const sig = text + cs;
    if (r.last !== sig || force) {
      r.last = sig;
      if (r.round) setMeterText(r.arc, text, v == null ? '' : ch.unit || '', v == null);
      else {
        setText(r.k('val'), text);
        setClass(r.k('val'), 'nosig', v == null);
        setText(r.k('unit'), v == null || ch.text ? '' : ch.unit || '');
      }
      const badge = r.k('badge');
      badge.innerHTML = ch.bands && cs >= 0 ? stateIcon(STATES[cs], 22) : '';
      r.el.dataset.state = ch.bands && cs >= 0 ? STATES[cs] : 'none';
      if (r.arc) updateMeter(r.arc, ch, v, cs >= 0 ? STATES[cs] : 'healthy');
      if (r.bar) r.bar.style.width = v == null ? '0%' : `${(Math.max(0, Math.min(1, (v - ch.min) / (ch.max - ch.min))) * 100).toFixed(0)}%`;
    }
    const tr = r.k('true');
    if (this.app.showTrue) { tr.hidden = false; setText(tr, `true ${formatValue(ch, sim.v[sd.id][ch.id])}`); } else tr.hidden = true;
  }
  for (const id in dv.charts) {
    const c = dv.charts[id], arr = sim.trend[sd.id][id];
    const sig = arr.length + ':' + arr[arr.length - 1];
    if (c.sig !== sig || force) { c.sig = sig; c.holder.innerHTML = trendChart(arr, c.ch, { label: c.ch.label }); }
  }
  for (const c of dv.ctls) c.update(sim);
  for (const l of dv.links) {
    const v = sim.shown[l.ls][l.lc], cs = v == null ? -1 : stateIndex(l.lch, v);
    const txt = v == null ? '--' : `${formatValue(l.lch, v)}${l.lch.unit ? ' ' + l.lch.unit : ''}`;
    const sig = txt + cs;
    if (l.last !== sig) { l.last = sig; setText(l.v, txt); l.st.innerHTML = cs >= 0 && l.lch.bands ? stateIcon(STATES[cs], 18) : ''; }
  }
  const w = sim.wear[sd.id];
  dv.wearFill.style.width = `${w.toFixed(0)}%`;
  setAttr(dv.wearBar, 'aria-valuenow', Math.round(w));
  setText(dv.wearText, `${Math.round(w)}%`);
  setClass(dv.wearBar, 'high', w >= 50);

  const lastLog = sim.log[sim.log.length - 1];
  if (dv.last.log !== lastLog || force) {
    dv.last.log = lastLog;
    dv.recentList.innerHTML = '';
    const mine = sim.log.filter((e) => e.sys === sd.id).slice(-6).reverse();
    if (!mine.length) dv.recentList.append(h('li', { class: 'muted', text: 'Nothing to report' }));
    for (const e of mine) {
      const li = h('li', { html: `<time>${clockText(e.t)}</time><span></span>` });
      li.querySelector('span').textContent = e.text;
      dv.recentList.append(li);
    }
  }
  for (const s of CONFIG.systems) {
    const it = dv.strip[s.id], ss = sim.st[s.id].s, sh = STATES[ss];
    const p = sim.shown[s.id][s.primary], ch = SYSTEM_BY_ID[s.id].channels.find((c) => c.id === s.primary);
    const sig = sh + (p == null ? '-' : formatValue(ch, p)) + (s.id === this.detailSys);
    if (it.last !== sig) {
      it.last = sig;
      it.el.dataset.state = sh;
      it.st.innerHTML = stateIcon(sh, 18);
      setText(it.v, p == null ? '--' : formatValue(ch, p));
      setClass(it.el, 'active', s.id === this.detailSys);
      setAttr(it.el, 'aria-label', `${s.name}: ${STATE_META[sh].long}`);
      if (s.id === this.detailSys) it.el.setAttribute('aria-current', 'true'); else it.el.removeAttribute('aria-current');
    }
  }
}
