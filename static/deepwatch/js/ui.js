// Dashboard UI: header, system tiles, station tile, banners, event log. Detail screen lives in detail.js.
import { CONFIG, STATES, STATE_META, SYSTEM_BY_ID } from './config.js';
import { formatValue, stateIndex, overallState, critCountdown, crisisState, activeNotices } from './sim.js';
import { h, setText, setAttr, setClass, ph, clockText } from './dom.js';
import { stateIcon, arcGaugeHTML, updateArc, setArcText, sparkline, patternDefs } from './svg.js';
import { fmtClock } from './util.js';
import * as audio from './audio.js';
import { installDetail } from './detail.js';

const CRISIS_HINT = {
  crisis_breach: 'Open Hull: dispatch the patch crew and raise the bilge pump.',
  crisis_trip: 'Open Power: lower the generator throttle to 40% or below to avert the trip.',
};

export class GameUI {
  constructor(root, app) {
    this.root = root;
    this.app = app; // { sim, demo, showTrue, togglePause(), quit(), replayWalkthrough(), menu }
    this.detailSys = null;
    this.logOpen = false;
    this.seenLog = null;
    this.cache = {};
    this.alarmClock = 0;
    this.build();
  }
  get sim() { return this.app.sim; }

  build() {
    const r = this.root;
    r.classList.add('game');
    r.innerHTML = '';
    r.append(h('div', { html: patternDefs() }));
    this.header = h('header', { class: 'topbar' });
    this.header.innerHTML = `
      <div class="brand">${ph('waves')}<span>Deepwatch</span></div>
      <div class="clock" data-k="clock" aria-label="Game day and time"></div>
      <div class="overall" data-k="overall" role="status" aria-live="polite"></div>
      <div class="actions">
        <button class="btn icon-btn" data-k="ack" hidden title="Acknowledge alarm sound" aria-label="Acknowledge alarm sound">${ph('bell-slash')}</button>
        <button class="btn icon-btn" data-k="pause" title="Pause" aria-label="Pause">${ph('pause')}</button>
        <button class="btn icon-btn" data-k="mute" title="Sound" aria-label="Mute sound">${ph('speaker-high')}</button>
        <button class="btn icon-btn" data-k="log" title="Event log" aria-label="Event log" aria-pressed="false">${ph('list-bullets')}<span class="dot" data-k="logdot" hidden></span></button>
        <button class="btn icon-btn" data-k="help" title="Replay walkthrough" aria-label="Replay walkthrough">${ph('question')}</button>
        <button class="btn icon-btn" data-k="menu" title="Menu" aria-label="Menu" aria-haspopup="true" aria-expanded="false">${ph('gear-six')}</button>
      </div>`;
    this.critBar = h('div', { class: 'crit-bar', hidden: true, role: 'alert' });
    this.crisisBanner = h('div', { class: 'crisis-banner', hidden: true, role: 'alert' });
    this.stage = h('main', { class: 'stage' });
    this.dash = h('section', { class: 'dashboard', 'aria-label': 'Station systems' });
    this.tiles = {};
    for (const sd of CONFIG.systems) this.dash.append(this.makeTile(sd));
    this.dash.append(this.makeStationTile());
    this.detail = h('section', { class: 'detail', hidden: true, 'aria-label': 'System detail' });
    this.logPanel = h('aside', { class: 'logpanel', hidden: true, 'aria-label': 'Event log' });
    this.logPanel.innerHTML = `<div class="logpanel-head"><h2>Event log</h2><button class="btn icon-btn" data-k="logclose" aria-label="Close event log" title="Close">${ph('x')}</button></div>
      <p class="logpanel-note">What the instruments and crew report. Causes stay hidden until the post-mortem.</p><ol class="loglist" data-k="loglist"></ol>`;
    this.pauseOverlay = h('div', { class: 'pause-overlay', hidden: true, role: 'status' });
    this.pauseOverlay.innerHTML = `<div class="pause-card">${ph('pause-circle')}<h2>PAUSED</h2><p>The station clock and all timers are stopped.</p><button class="btn primary" data-k="resume">${ph('play')} Resume</button></div>`;
    this.menuHost = h('div', { class: 'menu-host' });
    this.stage.append(this.dash, this.detail, this.logPanel);
    r.append(this.header, this.critBar, this.crisisBanner, this.stage, this.pauseOverlay, this.menuHost);

    const q = (k) => this.header.querySelector(`[data-k="${k}"]`);
    this.el = { clock: q('clock'), overall: q('overall'), ack: q('ack'), pause: q('pause'), mute: q('mute'), log: q('log'), logdot: q('logdot'), help: q('help'), menu: q('menu') };
    this.el.pause.onclick = () => this.app.togglePause();
    this.pauseOverlay.querySelector('[data-k="resume"]').onclick = () => this.app.togglePause();
    this.el.mute.onclick = () => this.app.toggleMute();
    this.el.log.onclick = () => this.setLogOpen(!this.logOpen);
    this.logPanel.querySelector('[data-k="logclose"]').onclick = () => this.setLogOpen(false);
    this.el.help.onclick = () => this.app.replayWalkthrough();
    this.el.ack.onclick = () => { audio.ack(); this.el.ack.hidden = true; };
    this.el.menu.onclick = () => this.app.menu && this.app.menu.toggle(this.el.menu);
    if (this.app.demo) for (const k of ['ack', 'pause', 'mute', 'help', 'menu']) this.el[k].style.visibility = 'hidden';
    installDetail(this);
  }

  /* ------------------------------------------------------------- tiles */

  makeTile(sd) {
    const prim = sd.channels.find((c) => c.id === sd.primary);
    const sec = sd.channels.find((c) => c.id === sd.tile[1]) || prim;
    const el = h('button', { class: 'tile', 'data-sys': sd.id, 'data-state': 'healthy', type: 'button' });
    el.innerHTML = `
      <div class="tile-head">${ph(sd.icon, 'tile-icon')}<span class="tile-name">${sd.name}</span><span class="tile-badge" data-k="badge"></span></div>
      <div class="tile-body">
        <div class="tile-gauge">${arcGaugeHTML(prim, 'tile-arc', { text: true })}</div>
        <div class="tile-side"><span class="side-label">${sec.label}</span><span class="side-val" data-k="sec">--</span><span class="side-true" data-k="true" hidden></span>
          <div class="tile-spark" data-k="spark"></div></div>
      </div>`;
    el.onclick = () => this.openDetail(sd.id);
    const t = { el, prim, sec, k: (k) => el.querySelector(`[data-k="${k}"]`), arc: el.querySelector('.arc'), last: {} };
    this.tiles[sd.id] = t;
    return el;
  }

  makeStationTile() {
    const el = h('div', { class: 'tile station-tile', 'data-state': 'healthy', 'aria-label': 'Station summary' });
    el.innerHTML = `<div class="tile-head">${ph('anchor-simple', 'tile-icon')}<span class="tile-name">Station</span><span class="tile-badge" data-k="badge"></span></div>
      <div class="station-body"><div class="station-status" data-k="status"></div><ul class="notices" data-k="notices"></ul></div>
      <div class="station-foot"><button class="btn small" data-k="openlog">${ph('list-bullets')} Event log</button><span class="station-day" data-k="uptime"></span></div>`;
    el.querySelector('[data-k="openlog"]').onclick = () => this.setLogOpen(true);
    this.station = { el, k: (k) => el.querySelector(`[data-k="${k}"]`), last: {} };
    return el;
  }

  readout(sys, chId) {
    const sim = this.sim, ch = SYSTEM_BY_ID[sys].channels.find((c) => c.id === chId);
    const v = sim.shown[sys][chId];
    return { ch, v, text: formatValue(ch, v), state: v == null ? -1 : stateIndex(ch, v) };
  }

  updateTiles(sim) {
    for (const sd of CONFIG.systems) {
      const t = this.tiles[sd.id], st = sim.st[sd.id];
      const state = STATES[st.s];
      if (t.last.state !== state) {
        t.el.dataset.state = state;
        t.k('badge').innerHTML = stateIcon(state, 24);
        t.last.state = state;
      }
      const p = this.readout(sd.id, sd.primary);
      const noSig = st.noData;
      const valText = noSig ? 'NO SIGNAL' : p.text;
      setArcText(t.arc, valText, noSig || p.ch.text ? '' : p.ch.unit, noSig);
      updateArc(t.arc, p.ch, p.v, state);
      const s = this.readout(sd.id, t.sec.id);
      setText(t.k('sec'), s.v == null ? '--' : `${s.text}${s.ch.unit ? ' ' + s.ch.unit : ''}`);
      const tr = t.k('true');
      if (this.app.showTrue) { tr.hidden = false; setText(tr, 'true ' + formatValue(p.ch, sim.v[sd.id][sd.primary])); } else tr.hidden = true;
      const label = `${sd.name}: ${STATE_META[state].long}. ${p.ch.label} ${valText}${p.ch.unit && !noSig ? ' ' + p.ch.unit : ''}`;
      setAttr(t.el, 'aria-label', label);
      const arr = sim.trend[sd.id][sd.primary];
      const sig = arr.length + ':' + arr[arr.length - 1];
      if (t.last.sig !== sig) { t.last.sig = sig; t.k('spark').innerHTML = sparkline(arr.slice(-120), p.ch); }
    }
  }

  updateStation(sim) {
    const s = this.station, lvl = overallState(sim), state = STATES[lvl];
    if (s.last.state !== state) { s.el.dataset.state = state; s.k('badge').innerHTML = stateIcon(state, 24); s.last.state = state; }
    setText(s.k('status'), this.overallText(sim));
    const ns = activeNotices(sim);
    const sig = ns.map((n) => n.uid + ':' + n.stage).join(',');
    if (s.last.notices !== sig) {
      s.last.notices = sig;
      const ul = s.k('notices');
      ul.innerHTML = '';
      if (!ns.length) ul.append(h('li', { class: 'muted', text: 'No open notices' }));
      for (const n of ns.slice(0, 4)) ul.append(h('li', { html: `${stateIcon(n.crisis ? 'critical' : n.stage ? 'alert' : 'caution', 16)}<span>${n.title}</span>` }));
    }
    setText(s.k('uptime'), `Survived ${(sim.t / 3600).toFixed(1)} days`);
  }

  overallText(sim) {
    const lvl = overallState(sim);
    if (lvl === 0) return 'All systems normal';
    const names = CONFIG.systems.filter((x) => sim.st[x.id].s === lvl).map((x) => x.name);
    return `${STATE_META[STATES[lvl]].long}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
  }

  /* ------------------------------------------------------- header etc. */

  updateHeader(sim) {
    setText(this.el.clock, clockText(sim.t));
    const lvl = overallState(sim), state = STATES[lvl];
    const sig = state + this.overallText(sim);
    if (this.cache.overall !== sig) {
      this.cache.overall = sig;
      this.el.overall.innerHTML = `${stateIcon(state, 26)}<span>${this.overallText(sim)}</span>`;
      this.el.overall.dataset.state = state;
    }
    const s = this.app.audioSettings();
    this.el.mute.innerHTML = ph(s.muted || s.volume === 0 ? 'speaker-slash' : 'speaker-high');
    setAttr(this.el.mute, 'aria-label', s.muted ? 'Unmute sound' : 'Mute sound');
    const paused = !!sim.paused;
    this.el.pause.innerHTML = ph(paused ? 'play' : 'pause');
    setAttr(this.el.pause, 'aria-label', paused ? 'Resume' : 'Pause');
    setAttr(this.el.pause, 'title', paused ? 'Resume' : 'Pause');
    const alarming = !this.app.demo && lvl > 0 && !audio.isAcked() && !s.muted;
    this.el.ack.hidden = !alarming;
  }

  updateBanners(sim) {
    const cd = critCountdown(sim);
    if (cd) {
      this.critBar.hidden = false;
      const html = `${stateIcon('critical', 22)}<strong>STATION PROTECTION</strong><span>${SYSTEM_BY_ID[cd.sys].name} is critical. The station is lost in <b>${fmtClock(cd.left)}</b> unless it recovers.</span>`;
      if (this.cache.crit !== html) { this.cache.crit = html; this.critBar.innerHTML = html; }
    } else if (!this.critBar.hidden) { this.critBar.hidden = true; this.cache.crit = ''; }

    const cr = crisisState(sim);
    if (!cr) { if (!this.crisisBanner.hidden) { this.crisisBanner.hidden = true; this.cache.crisis = ''; } return; }
    this.crisisBanner.hidden = false;
    this.crisisBanner.dataset.phase = cr.phase;
    const secs = Math.ceil(cr.secondsToEffect);
    const html = cr.phase === 'warning'
      ? `${stateIcon('critical', 44)}<div><div class="crisis-title">CRISIS WARNING: ${cr.title.replace('CRISIS: ', '')}</div><div class="crisis-sub">Critical effect begins in <b>${secs} s</b>. ${CRISIS_HINT[cr.def] || ''}</div></div>`
      : `${stateIcon('critical', 36)}<div><div class="crisis-title">CRISIS IN PROGRESS: ${cr.title.replace('CRISIS: ', '')}</div><div class="crisis-sub">${CRISIS_HINT[cr.def] || ''}</div></div>`;
    if (this.cache.crisis !== html) { this.cache.crisis = html; this.crisisBanner.innerHTML = html; }
  }

  updatePause(sim) {
    const p = !!sim.paused && !this.app.demo;
    this.pauseOverlay.hidden = !p;
    this.root.classList.toggle('is-paused', p);
    for (const el of this.detail.querySelectorAll('.controls, .sensor-table')) { if (p) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
  }

  /* --------------------------------------------------------------- log */

  setLogOpen(open) {
    this.logOpen = open;
    this.logPanel.hidden = !open;
    this.root.classList.toggle('log-open', open);
    setAttr(this.el.log, 'aria-pressed', open);
    if (open) { this.seenLog = this.sim.log[this.sim.log.length - 1] || null; this.cache.logRef = null; this.updateLog(this.sim); this.el.logdot.hidden = true; }
  }

  logIcon(e) {
    if (e.kind === 'state' || e.kind === 'alarm') return stateIcon(STATES[Math.min(3, e.sev)] , 18);
    if (e.kind === 'event') return stateIcon(e.sev >= 2 ? 'alert' : 'caution', 18);
    if (e.kind === 'player') return ph('user', 'log-glyph');
    if (e.kind === 'notice') return stateIcon('healthy', 18);
    return ph('info', 'log-glyph');
  }

  updateLog(sim) {
    const last = sim.log[sim.log.length - 1];
    if (!this.logOpen) {
      const fresh = last && last !== this.seenLog && last.kind !== 'player';
      this.el.logdot.hidden = !fresh;
      return;
    }
    if (this.cache.logRef === last && this.cache.logLen === sim.log.length) return;
    this.cache.logRef = last; this.cache.logLen = sim.log.length;
    const list = this.logPanel.querySelector('[data-k="loglist"]');
    list.innerHTML = '';
    for (const e of sim.log.slice(-150).reverse()) {
      const li = h('li', { class: `log-entry sev-${e.sev} kind-${e.kind}`, html: `${this.logIcon(e)}<time>${clockText(e.t)}</time><span class="log-text"></span>` });
      li.querySelector('.log-text').textContent = e.text;
      list.append(li);
    }
  }

  /* ------------------------------------------------------------ frame */

  update(now) {
    const sim = this.sim;
    if (!sim) return;
    this.updateHeader(sim);
    this.updateTiles(sim);
    this.updateStation(sim);
    this.updateBanners(sim);
    if (this.detailSys) this.updateDetail(sim);
    this.updateLog(sim);
    this.updatePause(sim);
    if (!this.app.demo && !sim.paused && !sim.over && now - this.alarmClock >= 1000) {
      this.alarmClock = now;
      audio.alarmTick(overallState(sim), now);
      const cr = crisisState(sim);
      audio.crisisTick(!!cr && cr.phase === 'warning', now);
      this.soundCues(sim);
    }
  }

  /** Short cues for new log entries: event blip, sensor-fault glitch. */
  soundCues(sim) {
    const len = sim.log.length, last = sim.log[len - 1];
    if (this.cache.cueRef === undefined) { this.cache.cueRef = last; return; }
    if (last === this.cache.cueRef) return;
    const idx = sim.log.lastIndexOf(this.cache.cueRef);
    const fresh = idx >= 0 ? sim.log.slice(idx + 1) : sim.log.slice(-3);
    this.cache.cueRef = last;
    if (fresh.some((e) => e.kind === 'state' && /no signal/i.test(e.text))) audio.glitch();
    else if (fresh.some((e) => e.kind === 'event')) audio.blip();
  }

  destroy() {
    this.root.innerHTML = '';
    this.root.classList.remove('game', 'is-paused', 'log-open');
  }
}
