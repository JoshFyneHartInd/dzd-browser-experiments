'use strict';
/* Shared helpers: state, theme, sound, toasts, modals, networking.
   Scripts are loaded in order (core, lobbies, room, main) and share one global scope. */

// ---------- tiny utils ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* storage unavailable */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  },
};

const PICKS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const pickLabel = (p) => t(`pick.${p}`);
const pickLower = (p) => pickLabel(p).toLocaleLowerCase(I18n.lang);
// "Rock crushes scissors." in the current language
const beatsText = (winner, loser) => t(`beats.${winner}`, { pick: pickLabel(winner), other: pickLower(loser) });
const HAND_COLOR = { rock: 'text-rock', paper: 'text-paper', scissors: 'text-scissors' };
const HAND_RING = { rock: 'border-rock bg-rock/10', paper: 'border-paper bg-paper/10', scissors: 'border-scissors bg-scissors/10' };

const icon = (name, cls = '') => `<i class="fa-solid fa-${name} ${cls}" aria-hidden="true"></i>`;
const hand = (kind, cls = 'h-10 w-10') =>
  `<svg class="${cls}" aria-hidden="true"><use href="icons.svg#i-${kind}" width="100%" height="100%"></use></svg>`;

const AVATAR_STYLES = ['bg-brand/15 text-brand', 'bg-accent/15 text-accent', 'bg-ink/10 text-ink'];
function avatar(name, size = 'h-8 w-8 text-sm') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="${size} flex shrink-0 items-center justify-center rounded-full font-semibold ${AVATAR_STYLES[h % 3]}" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>`;
}

const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- global app state ----------
const S = {
  cfg: null, // server-provided limits and emotes
  me: null, // { name }
  screen: 'start',
  online: false,
  lobbies: [],
  lobbiesAt: 0,
  loadingLobbies: false,
  filters: { q: '', access: 'all', status: 'all', hideFull: false },
  sort: { key: 'players', dir: 'desc' },
  filtersOpen: false,
  create: { step: 1, values: null },
  room: null, // latest room:state
  chat: [],
  unread: 0,
  clockOffset: 0,
  ui: {
    stageKey: null,
    myPick: null, // { round, choice }
    skipSummary: 0, // round number whose final result the user skipped past
    revealDone: 0,
    panels: { players: false, chat: false },
    lastTick: -1,
    chatCooldownUntil: 0,
    emoteOpen: false,
    summarySound: 0,
  },
};

const actions = {}; // data-act handlers, registered by each script
const forms = {}; // data-form handlers

// ---------- theme ----------
const Theme = {
  modes: ['system', 'light', 'dark'],
  icons: { system: 'circle-half-stroke', light: 'sun', dark: 'moon' },
  get() {
    const m = store.get('rps-theme', 'system');
    return this.modes.includes(m) ? m : 'system';
  },
  apply() {
    const m = this.get();
    const dark = m === 'dark' || (m === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0d0f13' : '#f5f6f8';
  },
  cycle() {
    const next = this.modes[(this.modes.indexOf(this.get()) + 1) % this.modes.length];
    store.set('rps-theme', next);
    this.apply();
    renderChrome();
    toast(t('theme.toast', { mode: t(`theme.${next}`) }), 'info', 1500);
  },
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (Theme.get() === 'system') Theme.apply();
});

// ---------- sound (synthesised with Web Audio, no files needed) ----------
const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = store.get('rps-muted', '0') === '1';

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, at, dur, o = {}) {
    const { type = 'sine', vol = 0.22, to = null, attack = 0.006 } = o;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function whoosh(at, dur, vol, from, to) {
    const t = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  const seq = (notes, step, dur, o) => notes.forEach((f, i) => tone(f, i * step, dur, o));

  const defs = {
    tap: () => tone(720, 0, 0.05, { type: 'triangle', vol: 0.1 }),
    pick: () => { tone(520, 0, 0.09, { type: 'triangle' }); tone(780, 0.07, 0.14, { type: 'triangle' }); },
    join: () => { tone(440, 0, 0.09, { type: 'triangle' }); tone(660, 0.09, 0.15, { type: 'triangle' }); },
    leave: () => { tone(520, 0, 0.09, { type: 'triangle' }); tone(390, 0.09, 0.16, { type: 'triangle' }); },
    error: () => tone(190, 0, 0.22, { type: 'square', vol: 0.1, to: 120 }),
    alert: () => seq([660, 880, 1100], 0.12, 0.2, { type: 'triangle', vol: 0.2 }),
    tick: () => tone(1000, 0, 0.05, { type: 'square', vol: 0.06 }),
    go: () => { tone(330, 0, 0.2, { type: 'sawtooth', vol: 0.09, to: 660 }); tone(660, 0.17, 0.2, { type: 'triangle' }); },
    reveal: () => whoosh(0, 1.1, 0.22, 300, 2400),
    land: () => { tone(120, 0, 0.28, { vol: 0.4, to: 55 }); tone(900, 0, 0.12, { type: 'triangle', vol: 0.1 }); },
    survive: () => seq([523, 659, 784], 0.08, 0.2, { type: 'triangle' }),
    tie: () => { tone(440, 0, 0.14, { type: 'square', vol: 0.07 }); tone(440, 0.18, 0.14, { type: 'square', vol: 0.07 }); },
    out: () => seq([392, 330, 262], 0.12, 0.24, { type: 'sawtooth', vol: 0.09 }),
    win: () => {
      seq([523, 659, 784, 1047], 0.11, 0.24, { type: 'triangle', vol: 0.22 });
      [523, 659, 784].forEach((f) => tone(f, 0.55, 0.8, { type: 'triangle', vol: 0.13 }));
    },
    lose: () => seq([392, 349, 311, 262], 0.16, 0.3, { type: 'triangle', vol: 0.16 }),
    chat: () => tone(880, 0, 0.06, { vol: 0.09, to: 660 }),
    kick: () => tone(150, 0, 0.26, { type: 'sawtooth', vol: 0.13, to: 70 }),
    swoosh: () => whoosh(0, 0.35, 0.12, 400, 1600),
  };

  return {
    unlock,
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      store.set('rps-muted', muted ? '1' : '0');
      if (!muted) { unlock(); setTimeout(() => this.play('tap'), 30); }
      renderChrome();
      if (typeof renderSoundSwitch === 'function') renderSoundSwitch();
    },
    toggle() { this.setMuted(!muted); },
    play(name) {
      if (muted || !ctx || ctx.state !== 'running') return;
      try { defs[name] && defs[name](); } catch (e) { /* audio is best-effort */ }
    },
  };
})();

// ---------- header controls ----------
function renderChrome() {
  const m = Theme.get();
  const label = t(`theme.${m}`);
  $('#chrome-actions').innerHTML = `
    ${S.me ? `<span class="chip mr-1 hidden max-w-[10rem] truncate sm:inline-flex">${icon('user')} <span class="truncate">${esc(S.me.name)}</span></span>` : ''}
    <button class="icon-btn" data-act="help" aria-label="${esc(t('help.aria'))}">${icon('circle-question')}</button>
    <button class="icon-btn" data-act="sound" aria-label="${esc(t(Sound.muted ? 'sound.ariaOff' : 'sound.ariaOn'))}" aria-pressed="${!Sound.muted}">${icon(Sound.muted ? 'volume-xmark' : 'volume-high')}</button>
    <button class="icon-btn" data-act="theme" aria-label="${esc(t('theme.aria', { mode: label }))}">${icon(Theme.icons[m])}</button>`;
}

actions.sound = () => Sound.toggle();
actions.theme = () => Theme.cycle();
function languageSelectHtml(id = 'lang-select') {
  const opts = I18n.list().map((l) => `<option value="${esc(l.code)}"${l.code === I18n.lang ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
  return `
    <div class="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-4 py-3">
      <label for="${id}" class="flex items-center gap-3 text-sm font-medium"><span class="text-muted">${icon('globe')}</span>${esc(t('lang.label'))}</label>
      <select id="${id}" data-lang class="input w-auto min-w-[8rem]">${opts}</select>
    </div>`;
}

actions.help = () => openModal({
  title: t('help.title'),
  html: `
    <ol class="space-y-3 text-sm text-ink">
      ${[1, 2, 3, 4, 5].map((n) => `<li class="flex gap-3"><span class="chip chip-brand shrink-0">${n}</span><span>${h(`help.s${n}`)}</span></li>`).join('')}
    </ol>
    <div class="mt-5">${languageSelectHtml('lang-select-help')}</div>`,
  actions: [{ label: esc(t('common.gotit')), cls: 'btn-primary' }],
});

// Static bits of index.html that carry data-i18n / data-i18n-attr="attr:key".
function applyStaticText() {
  document.title = t('meta.title');
  const d = $('meta[name="description"]');
  if (d) d.content = t('meta.desc');
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-attr]').forEach((n) => {
    const [attr, key] = n.dataset.i18nAttr.split(':');
    n.setAttribute(attr, t(key));
  });
}

// ---------- toasts ----------
function toast(msg, kind = 'info', ms = 3500) {
  const icons = { info: 'circle-info', ok: 'circle-check', error: 'triangle-exclamation' };
  const tint = { info: 'text-brand', ok: 'text-ok', error: 'text-danger' };
  const el = document.createElement('div');
  el.className = 'anim-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg';
  el.innerHTML = `<span class="${tint[kind] || tint.info} mt-0.5">${icon(icons[kind] || icons.info)}</span><span class="min-w-0 flex-1 break-words">${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  if (kind === 'error') Sound.play('error');
  setTimeout(() => el.remove(), ms);
}

// ---------- modal ----------
let activeModal = null;
function closeModal() {
  if (!activeModal) return;
  const { root, prevFocus } = activeModal;
  root.remove();
  activeModal = null;
  document.removeEventListener('keydown', modalKeys, true);
  if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
}
function modalKeys(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
  if (e.key === 'Tab' && activeModal) {
    const f = $$('button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex="-1"])', activeModal.root).filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
// actions: [{ label, cls, onClick(root) -> false keeps it open, submit: true }]
function openModal({ title, html, actions: acts = [], onOpen }) {
  closeModal();
  const root = document.createElement('div');
  root.className = 'fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4';
  root.innerHTML = `
    <div class="anim-in w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">${esc(title)}</h2>
        <button class="icon-btn -mr-2" data-modal-close aria-label="${esc(t('common.close'))}">${icon('xmark')}</button>
      </div>
      <form data-modal-form novalidate>
        <div>${html}</div>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          ${acts.map((a, i) => `<button type="${a.submit ? 'submit' : 'button'}" class="btn ${a.cls || 'btn-ghost'}" data-modal-act="${i}">${a.label}</button>`).join('')}
        </div>
      </form>
    </div>`;
  $('#modal-root').appendChild(root);
  activeModal = { root, prevFocus: document.activeElement };
  document.addEventListener('keydown', modalKeys, true);

  const run = async (i) => {
    const a = acts[i];
    if (!a) return closeModal();
    const res = a.onClick ? await a.onClick(root) : undefined;
    if (res !== false) closeModal();
  };
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-modal-close]')) return closeModal();
    const b = e.target.closest('[data-modal-act]');
    if (b && b.type !== 'submit') run(Number(b.dataset.modalAct));
  });
  $('[data-modal-form]', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const i = acts.findIndex((a) => a.submit);
    if (i >= 0) run(i);
  });
  const focusTarget = $('input, select', root) || $('[data-modal-act]:last-of-type', root);
  if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  if (onOpen) onOpen(root);
  return root;
}

// ---------- networking ----------
const SERVER_URL = (window.RPS_CONFIG && window.RPS_CONFIG.SERVER_URL || '').replace(/\/$/, '');
const socket = io(SERVER_URL || undefined, { autoConnect: false });

function emit(event, payload) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, code: 'offline', error: t('err.offline') });
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ ok: false, code: 'timeout', error: t('err.timeout') }); }
    }, 8000);
    socket.emit(event, payload || {}, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res || { ok: false, code: 'no_response', error: t('err.no_response') });
    });
  });
}

function showConn(text) {
  const el = $('#conn');
  if (!text) { el.classList.add('hidden'); return; }
  el.innerHTML = `${icon('plug-circle-xmark')} ${esc(text)}`;
  el.classList.remove('hidden');
}

// Server-side offset so countdowns follow the server clock.
const serverNow = () => Date.now() + S.clockOffset;

// ---------- small shared view bits ----------
function soundSwitchHtml() {
  return `
    <div class="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-4 py-3">
      <div class="flex items-center gap-3 text-sm font-medium"><span class="text-muted" data-snd-icon>${icon(Sound.muted ? 'volume-xmark' : 'volume-high')}</span>
        <span>${esc(t('sound.label'))}</span></div>
      <button type="button" role="switch" aria-checked="${!Sound.muted}" aria-label="${esc(t('sound.label'))}" data-act="sound" data-snd-switch
        class="relative h-7 w-12 shrink-0 rounded-full transition ${Sound.muted ? 'bg-line' : 'bg-brand'}">
        <span class="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${Sound.muted ? 'left-0.5' : 'left-[1.375rem]'}"></span>
      </button>
    </div>`;
}
function renderSoundSwitch() {
  const wrap = $('[data-snd-switch]');
  if (!wrap) return;
  const holder = wrap.closest('div.flex.items-center.justify-between');
  if (holder) holder.outerHTML = soundSwitchHtml();
}

function strikePips(n, max) {
  let out = '';
  for (let i = 0; i < max; i++) {
    out += `<span class="inline-block h-2.5 w-2.5 rounded-full ${i < n ? 'bg-danger' : 'bg-line'}"></span>`;
  }
  return `<span class="inline-flex items-center gap-1" role="img" aria-label="${esc(t('round.strikes'))} ${n}/${max}">${out}</span>`;
}

function timerRing(id, size = 'h-28 w-28') {
  const C = 2 * Math.PI * 44;
  return `
    <div class="relative ${size} shrink-0" data-ring-wrap="${id}">
      <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
        <circle class="ring-bg" cx="50" cy="50" r="44" fill="none" stroke-width="7"/>
        <circle class="ring-fg" data-ring-fg="${id}" cx="50" cy="50" r="44" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/>
      </svg>
      <div class="absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums" data-secs="${id}" aria-live="off">–</div>
    </div>`;
}

// ---------- server replies ----------
// Turn a failed reply into text in the current language. The server always sends a
// stable `code`; the English `error` it also sends is only a fallback.
function errText(res, fallbackKey) {
  if (!res) return fallbackKey ? t(fallbackKey) : '';
  let code = res.code;
  if (code === 'rate_limited' || code === 'wrong_phrase' || code === 'wrong_password') {
    if (res.retryMs || (res.lockedMs)) code = 'rate_limited_wait';
  }
  const params = { ...res, min: Math.max(1, Math.ceil((res.retryMs || 0) / 60000)) };
  if (code && I18n.has(`err.${code}`)) return t(`err.${code}`, params);
  return res.error || (fallbackKey ? t(fallbackKey) : '');
}

// Field-level validation errors (lobby options). `res.fieldCodes` refines a field's reason.
function fieldText(field, res) {
  const c = S.cfg || {};
  const code = (res && res.fieldCodes && res.fieldCodes[field]) || field;
  const params = { n: res && res.n, min: field === 'selectionTime' ? c.selectionMin : c.playersMin, max: field === 'selectionTime' ? c.selectionMax : c.playersMax };
  if (I18n.has(`field.${code}`)) return t(`field.${code}`, params);
  return (res && res.fields && res.fields[field]) || '';
}
function localizedFields(res) {
  const out = {};
  for (const f of Object.keys((res && res.fields) || {})) out[f] = fieldText(f, res);
  return out;
}
