// Dashboard menu (theme picker, sound, walkthrough, quit) and the ?debug=1 panel.
import { THEMES, THEME_GROUPS, getTheme, applyTheme } from './themes.js';
import { CONFIG, SYSTEM_BY_ID } from './config.js';
import { EVENT_DEFS } from './events.js';
import { forceEvent } from './sim.js';
import { h, ph } from './dom.js';
import * as audio from './audio.js';

export class Menu {
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.committed = app.themeId();
    this.panel = null;
  }
  isOpen() { return !!this.panel; }
  toggle(anchor) { this.isOpen() ? this.close() : this.open(anchor); }

  open(anchor) {
    if (this.panel) return;
    this.anchor = anchor;
    this.committed = this.app.themeId();
    const s = this.app.audioSettings();
    const p = (this.panel = h('div', { class: 'menu-panel', role: 'dialog', 'aria-label': 'Menu' }));
    p.innerHTML = `
      <div class="menu-head"><h2>Menu</h2><button class="btn icon-btn" data-k="close" aria-label="Close menu" title="Close">${ph('x')}</button></div>
      <section class="menu-sec"><h3>Theme</h3>
        <label class="sr-only" for="theme-search">Search themes</label>
        <div class="search">${ph('magnifying-glass')}<input id="theme-search" type="search" placeholder="Search themes" autocomplete="off" spellcheck="false"></div>
        <div class="theme-list" data-k="list" role="listbox" aria-label="Themes"></div>
      </section>
      <section class="menu-sec"><h3>Sound</h3>
        <div class="menu-row"><label for="m-sound">Sound</label><button id="m-sound" class="switch" type="button" role="switch" aria-checked="${!s.muted}"><span class="switch-knob"></span><span class="switch-text">${s.muted ? 'OFF' : 'ON'}</span></button></div>
        <div class="menu-row"><label for="m-vol">Volume</label><input id="m-vol" type="range" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}"></div>
      </section>
      <section class="menu-sec menu-actions">
        <button class="btn" data-k="replay">${ph('question')} Replay walkthrough</button>
        <button class="btn danger" data-k="quit">${ph('sign-out')} Quit to title</button>
      </section>`;
    this.host.append(p);
    const q = (k) => p.querySelector(`[data-k="${k}"]`);
    q('close').onclick = () => this.close();
    q('replay').onclick = () => { this.close(); this.app.replayWalkthrough(); };
    q('quit').onclick = () => { this.close(); this.app.quit(); };
    const sw = p.querySelector('#m-sound'), vol = p.querySelector('#m-vol');
    sw.onclick = () => {
      const muted = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', String(!muted));
      sw.querySelector('.switch-text').textContent = muted ? 'OFF' : 'ON';
      this.app.setAudio({ muted });
      if (!muted) return;
      audio.click();
    };
    vol.oninput = () => { this.app.setAudio({ volume: +vol.value / 100 }); audio.tick(); };
    this.search = p.querySelector('#theme-search');
    this.list = q('list');
    this.search.oninput = () => this.renderList();
    this.search.onkeydown = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); this.focusOption(0); } };
    this.list.addEventListener('mouseleave', () => this.restore());
    this.list.addEventListener('focusout', (e) => { if (!this.list.contains(e.relatedTarget)) this.restore(); });
    this.renderList();
    if (this.anchor) this.anchor.setAttribute('aria-expanded', 'true');
    (this.search).focus({ preventScroll: true });
    this.outside = (e) => { if (this.panel && !this.panel.contains(e.target) && !(this.anchor && this.anchor.contains(e.target))) this.close(); };
    setTimeout(() => document.addEventListener('pointerdown', this.outside), 0);
  }

  close() {
    if (!this.panel) return;
    this.restore();
    document.removeEventListener('pointerdown', this.outside);
    this.panel.remove();
    this.panel = null;
    if (this.anchor) { this.anchor.setAttribute('aria-expanded', 'false'); this.anchor.focus({ preventScroll: true }); }
  }

  renderList() {
    const term = this.search.value.trim().toLowerCase();
    this.list.innerHTML = '';
    let any = false;
    for (const g of THEME_GROUPS) {
      const items = THEMES.filter((t) => t.group === g && (!term || t.name.toLowerCase().includes(term) || g.toLowerCase().includes(term)));
      if (!items.length) continue;
      any = true;
      const grp = h('div', { class: 'theme-group', role: 'group', 'aria-label': g }, h('div', { class: 'group-title', text: g }));
      for (const t of items) grp.append(this.option(t));
      this.list.append(grp);
    }
    if (!any) this.list.append(h('p', { class: 'muted pad', text: 'No themes match.' }));
  }

  option(t) {
    const k = t.tokens;
    const sw = (c) => `<i style="background:${c}"></i>`;
    const cur = t.id === this.committed;
    const b = h('button', { class: 'theme-opt', type: 'button', role: 'option', 'aria-selected': String(cur), 'data-id': t.id, tabindex: '-1' });
    b.innerHTML = `<span class="swatch" aria-hidden="true">${sw(k.bg)}${sw(k.surface)}${sw(k.accent)}${sw(k.healthy)}${sw(k.critical)}</span><span class="theme-name">${t.name}</span><span class="theme-check" aria-hidden="true">${cur ? ph('check-bold') : ''}</span>`;
    if (cur) b.setAttribute('aria-label', `${t.name}, current theme`);
    b.addEventListener('mouseenter', () => this.preview(t.id));
    b.addEventListener('focus', () => this.preview(t.id));
    b.addEventListener('click', () => this.confirm(t.id));
    b.addEventListener('keydown', (e) => this.optionKey(e, b));
    return b;
  }

  options() { return [...this.list.querySelectorAll('.theme-opt')]; }
  focusOption(i) { const o = this.options(); if (o.length) { const el = o[Math.max(0, Math.min(o.length - 1, i))]; el.focus(); el.scrollIntoView({ block: 'nearest' }); } }
  optionKey(e, b) {
    const o = this.options(), i = o.indexOf(b);
    if (e.key === 'ArrowDown') { e.preventDefault(); this.focusOption(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) this.search.focus(); else this.focusOption(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); this.focusOption(0); }
    else if (e.key === 'End') { e.preventDefault(); this.focusOption(o.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.confirm(b.dataset.id); }
  }

  preview(id) { applyTheme(id, { persist: false }); }
  restore() { applyTheme(this.committed, { persist: false }); }
  confirm(id) {
    this.committed = id;
    applyTheme(id, { persist: true });
    this.app.onThemeChange && this.app.onThemeChange(id);
    audio.confirm();
    for (const o of this.options()) {
      const cur = o.dataset.id === id;
      o.setAttribute('aria-selected', String(cur));
      o.querySelector('.theme-check').innerHTML = cur ? ph('check-bold') : '';
      if (cur) o.setAttribute('aria-label', `${getTheme(id).name}, current theme`); else o.removeAttribute('aria-label');
    }
  }
}

/** ?debug=1: speed multiplier, force an event, show true values beside displayed ones. */
export class DebugPanel {
  constructor(host, app) {
    this.app = app;
    const evOptions = Object.keys(EVENT_DEFS).map((k) => `<option value="${k}">${k}</option>`).join('');
    const sysOptions = CONFIG.systems.filter((s) => s.id !== 'instruments').map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    this.el = h('details', { class: 'debug-panel' });
    this.el.innerHTML = `<summary>Debug</summary>
      <div class="dbg-row"><span>Speed</span>
        ${[1, 10, 60].map((n) => `<button class="btn small" data-speed="${n}" aria-pressed="${n === 1}">x${n}</button>`).join('')}</div>
      <div class="dbg-row"><select data-k="ev" aria-label="Event">${evOptions}</select>
        <select data-k="sys" aria-label="System (equipment and sensor faults)">${sysOptions}</select>
        <select data-k="mode" aria-label="Sensor fault mode"><option>phantom</option><option>stuck</option><option>dropout</option></select>
        <button class="btn small" data-k="fire">Trigger</button></div>
      <div class="dbg-row"><label><input type="checkbox" data-k="true"> Show true values</label></div>`;
    host.append(this.el);
    for (const b of this.el.querySelectorAll('[data-speed]')) {
      b.onclick = () => { app.speed = +b.dataset.speed; for (const o of this.el.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b)); };
    }
    this.el.querySelector('[data-k="fire"]').onclick = () => {
      const def = this.el.querySelector('[data-k="ev"]').value;
      const sys = this.el.querySelector('[data-k="sys"]').value;
      const mode = this.el.querySelector('[data-k="mode"]').value;
      forceEvent(app.sim, def, def === 'equip' || def === 'sensor' ? { sys, mode: def === 'sensor' ? mode : undefined } : {});
    };
    this.el.querySelector('[data-k="true"]').onchange = (e) => { app.showTrue = e.target.checked; };
  }
  destroy() { this.el.remove(); }
}
