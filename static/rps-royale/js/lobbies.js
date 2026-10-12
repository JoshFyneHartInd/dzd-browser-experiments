'use strict';
/* Start screen, lobby browser and the create-lobby flow. */

const CHAT_MODES = [
  { id: 'enabled', key: 'chat.on', ic: 'comments' },
  { id: 'emotes', key: 'chat.emotes', ic: 'face-smile' },
  { id: 'disabled', key: 'chat.off', ic: 'comment-slash' },
];
const chatModeText = (id) => t(CHAT_MODES.find((m) => m.id === id).key);

// ============ invite links ============
// A lobby's invite link is the app's own address plus #join=<lobby id>. It works on any static
// host (the hash never reaches the server) and the lobby's password, if any, is still asked for.
const INVITE_RE = /^#join=([a-f0-9]{10})$/i;
const readInviteHash = () => { const m = INVITE_RE.exec(location.hash); return m ? m[1].toLowerCase() : null; };
function clearInviteHash() {
  if (INVITE_RE.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
const inviteUrl = (id) => `${location.origin}${location.pathname}#join=${id}`;

// After a username exists: go straight to the invited lobby if there is one, else the lobby list.
async function goAfterLogin() {
  const id = S.pendingJoin;
  if (!id) return showBrowser();
  S.pendingJoin = null;
  clearInviteHash();
  const res = await emit('lobbies:list');
  showBrowser();
  if (res.ok) S.lobbies = res.lobbies;
  const lobby = S.lobbies.find((l) => l.id === id);
  if (!lobby) return toast(t('join.gone'), 'error');
  if (lobby.players >= lobby.maxPlayers) return toast(t('join.full'), 'error');
  joinLobby(id); // asks for the password if the lobby has one
}

actions.invite = () => {
  const r = S.room;
  if (!r) return;
  const url = inviteUrl(r.id);
  const done = () => toast(t(r.isPrivate ? 'invite.copiedPrivate' : 'invite.copied'), 'ok');
  const manual = () => openModal({
    title: t('invite.title'),
    html: `<p class="mb-3 text-sm text-muted">${esc(t('invite.copyHelp'))}</p>
      <input id="invite-url" class="input" readonly value="${esc(url)}" aria-label="${esc(t('invite.title'))}">`,
    actions: [{ label: esc(t('common.close')), cls: 'btn-primary' }],
    onOpen: (root) => { const i = $('#invite-url', root); setTimeout(() => { i.focus(); i.select(); }, 40); },
  });
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, manual);
  else manual();
};

// ============ start screen ============
function showStart(message, typedName) {
  S.screen = 'start';
  S.room = null;
  stopBrowserTimers();
  $('#screen').innerHTML = `
    <section class="anim-in mx-auto max-w-md pt-2 sm:pt-10">
      <div class="card p-6 sm:p-8">
        <div class="mb-6 flex items-center gap-3" aria-hidden="true">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-rock/10 text-rock">${hand('rock', 'h-8 w-8')}</span>
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-paper/10 text-paper">${hand('paper', 'h-8 w-8')}</span>
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-scissors/10 text-scissors">${hand('scissors', 'h-8 w-8')}</span>
        </div>
        ${S.pendingJoin ? `<p class="mb-4 flex items-start gap-2 rounded-xl bg-brand/10 px-3 py-2.5 text-sm text-ink">${icon('link', 'mt-0.5 text-brand')} <span>${esc(t('invite.banner'))}</span></p>` : ''}
        <h1 class="text-3xl font-semibold leading-tight tracking-tight">${esc(t('brand.a'))} <span class="text-accent">${esc(t('brand.b'))}</span></h1>
        <p class="mt-2 text-muted">${esc(t('start.tagline'))}</p>

        <form data-form="start" class="mt-6 space-y-4" novalidate>
          <div>
            <label class="label" for="username">${esc(t('start.userLabel'))}</label>
            <input id="username" class="input" maxlength="16" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
              placeholder="${esc(t('start.userPh'))}" value="${esc(typedName != null ? typedName : store.get('rps-name', ''))}" aria-describedby="start-err start-hint">
            <p id="start-hint" class="hint">${esc(t('start.userHint'))}</p>
            <p id="start-err" class="field-err" role="alert">${esc(message || '')}</p>
          </div>
          <button class="btn btn-primary btn-lg w-full" type="submit">${esc(t('start.play'))} ${icon('arrow-right')}</button>
        </form>

        <div class="mt-5 space-y-2">${languageSelectHtml()}${soundSwitchHtml()}</div>
      </div>
    </section>`;
  const input = $('#username');
  if (input && !('ontouchstart' in window)) input.focus();
}

forms.start = async (form) => {
  const input = $('#username');
  const err = $('#start-err');
  const btn = $('button[type=submit]', form);
  const name = input.value.trim();
  err.textContent = '';
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    err.textContent = t('start.errName');
    Sound.play('error');
    input.focus();
    return;
  }
  btn.disabled = true;
  const res = await emit('session:start', { username: name });
  btn.disabled = false;
  if (!res.ok) {
    err.textContent = errText(res, 'start.errGeneric');
    Sound.play('error');
    return;
  }
  store.set('rps-token', res.token);
  store.set('rps-name', res.name);
  S.me = { name: res.name };
  S.cfg = res.config;
  renderChrome();
  Sound.play('join');
  goAfterLogin();
};

// ============ lobby browser ============
let browserTick = null;
let nextRefreshAt = 0;

function stopBrowserTimers() {
  if (browserTick) clearInterval(browserTick);
  browserTick = null;
}

function showBrowser() {
  S.screen = 'browser';
  S.room = null;
  S.ui.stageKey = null;
  renderBrowser();
  stopBrowserTimers();
  refreshLobbies();
  browserTick = setInterval(() => {
    if (S.screen !== 'browser') return stopBrowserTimers();
    if (!document.hidden && Date.now() >= nextRefreshAt) refreshLobbies();
    updateRefreshLabel();
  }, 1000);
}

async function refreshLobbies(manual) {
  if (S.loadingLobbies) return;
  S.loadingLobbies = true;
  updateRefreshLabel();
  const res = await emit('lobbies:list');
  S.loadingLobbies = false;
  nextRefreshAt = Date.now() + 10000;
  if (res.ok) {
    S.lobbies = res.lobbies;
    S.lobbiesAt = Date.now();
    if (S.screen === 'browser') renderLobbyList();
  } else if (res.code === 'no_session') {
    bootSession();
  } else if (manual) {
    toast(errText(res), 'error');
  }
  updateRefreshLabel();
}

function updateRefreshLabel() {
  const btn = $('#refresh-btn');
  if (!btn) return;
  const secs = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  $('i', btn).classList.toggle('spin', S.loadingLobbies);
  const label = $('[data-refresh-label]', btn);
  if (label) label.textContent = S.loadingLobbies ? t('refresh.loading') : t('refresh.timer', { s: secs });
}

function renderBrowser() {
  const f = S.filters;
  $('#screen').innerHTML = `
    <section class="anim-in space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">${esc(t('lobbies.title'))}</h1>
          <p class="text-sm text-muted" id="lobby-sub">${esc(t('lobbies.sub'))}</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="refresh-btn" class="btn btn-ghost" data-act="refresh" aria-label="${esc(t('refresh.aria'))}">${icon('rotate')}
            <span class="hidden text-muted sm:inline" data-refresh-label>${esc(t('refresh.label'))}</span></button>
          <button class="btn btn-primary" data-act="create">${icon('plus')} ${esc(t('lobbies.create'))}</button>
        </div>
      </div>

      <div class="card">
        <button class="panel-head md:hidden" data-act="toggle-filters" aria-expanded="${S.filtersOpen}">
          <span class="flex items-center gap-2">${icon('sliders', 'text-muted')} ${esc(t('filters.title'))}</span>
          <i class="fa-solid fa-chevron-down text-muted transition ${S.filtersOpen ? 'rotate-180' : ''}" aria-hidden="true"></i>
        </button>
        <div id="filters-body" class="${S.filtersOpen ? '' : 'hidden'} grid gap-3 p-4 pt-1 md:grid! md:grid-cols-[minmax(0,1.6fr)_1fr_1fr_auto] md:items-end md:pt-4">
          <div>
            <label class="label" for="f-q">${esc(t('filter.search'))}</label>
            <input id="f-q" class="input" data-filter="q" type="search" placeholder="${esc(t('filter.searchPh'))}" value="${esc(f.q)}" autocomplete="off">
          </div>
          <div>
            <label class="label" for="f-access">${esc(t('filter.access'))}</label>
            <select id="f-access" class="input" data-filter="access">
              <option value="all"${f.access === 'all' ? ' selected' : ''}>${esc(t('common.any'))}</option>
              <option value="public"${f.access === 'public' ? ' selected' : ''}>${esc(t('access.public'))}</option>
              <option value="private"${f.access === 'private' ? ' selected' : ''}>${esc(t('access.password'))}</option>
            </select>
          </div>
          <div>
            <label class="label" for="f-status">${esc(t('filter.status'))}</label>
            <select id="f-status" class="input" data-filter="status">
              <option value="all"${f.status === 'all' ? ' selected' : ''}>${esc(t('common.any'))}</option>
              <option value="waiting"${f.status === 'waiting' ? ' selected' : ''}>${esc(t('status.waiting'))}</option>
              <option value="ingame"${f.status === 'ingame' ? ' selected' : ''}>${esc(t('status.ingame'))}</option>
            </select>
          </div>
          <label class="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" class="h-5 w-5 accent-brand" data-filter="hideFull"${f.hideFull ? ' checked' : ''}> ${esc(t('filter.hideFull'))}
          </label>
          <div class="md:hidden">
            <label class="label" for="f-sort">${esc(t('sort.by'))}</label>
            <div class="flex gap-2">
              <select id="f-sort" class="input" data-filter="sortKey">
                ${['players', 'name', 'access', 'status']
                  .map((k) => `<option value="${k}"${S.sort.key === k ? ' selected' : ''}>${esc(t(`sort.${k}`))}</option>`).join('')}
              </select>
              <button class="btn btn-ghost w-12 px-0" data-act="sort-dir" aria-label="${esc(t('sort.reverse'))}">${icon(S.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down')}</button>
            </div>
          </div>
        </div>
      </div>

      <div id="lobby-list" class="space-y-2"></div>
    </section>`;
  renderLobbyList();
  updateRefreshLabel();
}

function visibleLobbies() {
  const f = S.filters;
  const q = f.q.trim().toLowerCase();
  let list = S.lobbies.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q)) return false;
    if (f.access === 'public' && l.isPrivate) return false;
    if (f.access === 'private' && !l.isPrivate) return false;
    if (f.status === 'waiting' && l.inGame) return false;
    if (f.status === 'ingame' && !l.inGame) return false;
    if (f.hideFull && l.players >= l.maxPlayers) return false;
    return true;
  });
  const { key, dir } = S.sort;
  const val = {
    name: (l) => l.name.toLowerCase(),
    players: (l) => l.players,
    access: (l) => (l.isPrivate ? 1 : 0),
    status: (l) => (l.inGame ? 1 : 0),
  }[key];
  list = list.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (dir === 'asc' ? c : -c) || a.name.localeCompare(b.name);
  });
  return list;
}

function sortHead(key) {
  const label = esc(t(`sort.${key}`));
  const on = S.sort.key === key;
  return `<button class="flex items-center gap-1.5 text-left uppercase tracking-wide ${on ? 'text-ink' : 'text-muted hover:text-ink'}" data-act="sort" data-key="${key}">
    ${label}${on ? icon(S.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down', 'text-[10px]') : ''}</button>`;
}

const LOBBY_GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_90px_110px_110px_112px] md:items-center md:gap-4';

function lobbyRow(l) {
  const full = l.players >= l.maxPlayers;
  const status = l.inGame ? `<span class="chip chip-warn">${icon('gamepad')} ${esc(t('status.ingame'))}</span>` : `<span class="chip chip-ok">${icon('hourglass-half')} ${esc(t('status.waiting'))}</span>`;
  const access = l.isPrivate ? `<span class="chip chip-accent">${icon('lock')} ${esc(t('access.password'))}</span>` : `<span class="chip">${icon('lock-open')} ${esc(t('access.public'))}</span>`;
  const btn = full
    ? `<button class="btn btn-ghost w-full md:w-auto" disabled>${esc(t('lobby.full'))}</button>`
    : l.inGame
      ? `<button class="btn btn-ghost w-full md:w-auto" data-act="join" data-id="${esc(l.id)}">${icon('eye')} ${esc(t('lobby.watch'))}</button>`
      : `<button class="btn btn-primary w-full md:w-auto" data-act="join" data-id="${esc(l.id)}">${esc(t('lobby.join'))} ${icon('arrow-right')}</button>`;
  return `
    <div class="card flex flex-col gap-3 p-4 md:py-3 ${LOBBY_GRID}">
      <div class="min-w-0">
        <p class="truncate font-medium">${esc(l.name)}</p>
        <p class="text-xs text-muted">${esc(chatModeText(l.chatMode))} · ${esc(t('lobby.picks', { s: l.selectionTime }))}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 md:contents">
        <span class="chip md:bg-transparent md:px-0 md:text-sm md:text-ink" title="${esc(t('lobby.playersTitle'))}">${icon('users')} ${l.players}/${l.maxPlayers}</span>
        <span class="md:justify-self-start">${access}</span>
        <span class="md:justify-self-start">${status}</span>
      </div>
      <div class="md:justify-self-end">${btn}</div>
    </div>`;
}

function renderLobbyList() {
  const host = $('#lobby-list');
  if (!host) return;
  const list = visibleLobbies();
  const sub = $('#lobby-sub');
  if (sub) sub.textContent = S.lobbies.length ? t('lobbies.subCount', { count: S.lobbies.length }) : t('lobbies.sub');

  if (!S.lobbies.length) {
    host.innerHTML = `
      <div class="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-muted">${icon('ghost', 'text-xl')}</span>
        <p class="font-medium">${esc(t('lobbies.emptyTitle'))}</p>
        <p class="max-w-xs text-sm text-muted">${esc(t('lobbies.emptyText'))}</p>
        <button class="btn btn-primary mt-1" data-act="create">${icon('plus')} ${esc(t('lobbies.create'))}</button>
      </div>`;
    return;
  }
  if (!list.length) {
    host.innerHTML = `
      <div class="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p class="font-medium">${esc(t('lobbies.noMatch'))}</p>
        <button class="btn btn-ghost" data-act="reset-filters">${esc(t('filter.clear'))}</button>
      </div>`;
    return;
  }
  host.innerHTML = `
    <div class="px-4 text-xs font-medium max-md:hidden ${LOBBY_GRID}">
      ${sortHead('name')}${sortHead('players')}${sortHead('access')}${sortHead('status')}<span></span>
    </div>
    ${list.map(lobbyRow).join('')}`;
}

actions.refresh = () => refreshLobbies(true);
actions['toggle-filters'] = () => { S.filtersOpen = !S.filtersOpen; renderBrowser(); };
actions.sort = (el) => {
  const key = el.dataset.key;
  if (S.sort.key === key) S.sort.dir = S.sort.dir === 'asc' ? 'desc' : 'asc';
  else S.sort = { key, dir: key === 'name' ? 'asc' : 'desc' };
  renderLobbyList();
};
actions['sort-dir'] = () => {
  S.sort.dir = S.sort.dir === 'asc' ? 'desc' : 'asc';
  renderBrowser();
};
actions['reset-filters'] = () => {
  S.filters = { q: '', access: 'all', status: 'all', hideFull: false };
  renderBrowser();
};
function onFilterInput(el) {
  const k = el.dataset.filter;
  if (k === 'hideFull') S.filters.hideFull = el.checked;
  else if (k === 'sortKey') S.sort = { key: el.value, dir: el.value === 'name' ? 'asc' : 'desc' };
  else S.filters[k] = el.value;
  renderLobbyList();
}

// ---- joining ----
actions.join = (el) => joinLobby(el.dataset.id);

async function joinLobby(id) {
  const lobby = S.lobbies.find((l) => l.id === id);
  if (!lobby) return;
  if (lobby.isPrivate) {
    openModal({
      title: t('join.title', { name: lobby.name }),
      html: `
        <label class="label" for="join-pw">${esc(t('join.pwLabel'))}</label>
        <input id="join-pw" class="input" type="password" autocomplete="off" maxlength="64" placeholder="${esc(t('join.pwPh'))}">
        <p id="join-err" class="field-err" role="alert"></p>`,
      actions: [
        { label: esc(t('common.cancel')), cls: 'btn-ghost' },
        {
          label: esc(t('lobby.join')), cls: 'btn-primary', submit: true,
          onClick: async (root) => {
            const pw = $('#join-pw', root).value;
            const err = $('#join-err', root);
            if (!pw) { err.textContent = t('join.errEmpty'); return false; }
            const res = await emit('lobby:join', { id, password: pw });
            if (res.ok) { enterRoom(res.room); return true; }
            if (res.code === 'wrong_password' || res.code === 'rate_limited') {
              err.textContent = res.attemptsLeft != null && res.attemptsLeft > 0 && res.code === 'wrong_password'
                ? `${errText(res)} ${t('tries.left', { count: res.attemptsLeft })}` : errText(res);
              Sound.play('error');
              return false;
            }
            joinFailed(res);
            return true;
          },
        },
      ],
    });
    return;
  }
  const res = await emit('lobby:join', { id });
  if (res.ok) enterRoom(res.room);
  else joinFailed(res);
}

function joinFailed(res) {
  toast(errText(res, 'join.failed'), 'error');
  if (S.screen === 'browser') refreshLobbies();
}

// ============ create lobby ============
function defaultOptions() {
  const c = S.cfg;
  const base = t('opt.defaultName', { name: S.me.name.replace(/_/g, ' ') }).slice(0, 24).trim();
  return { name: base, chatMode: 'enabled', advanceMode: 'auto', isPrivate: false, password: '', selectionTime: c.selectionDefault, maxPlayers: c.playersDefault };
}

function optionsFormHtml(v, edit) {
  const c = S.cfg;
  return `
    <div class="space-y-5">
      <div>
        <label class="label" for="opt-name">${esc(t('opt.nameLabel'))}</label>
        <input id="opt-name" class="input" maxlength="24" autocomplete="off" spellcheck="false" value="${esc(v.name)}" placeholder="${esc(t('opt.namePh'))}">
        <p class="hint">${esc(t('opt.nameHint'))}</p>
        <p class="field-err" data-err="name" role="alert"></p>
      </div>

      <div>
        <span class="label" id="lbl-chat">${esc(t('opt.chat'))}</span>
        <div class="seg" role="radiogroup" aria-labelledby="lbl-chat">
          ${CHAT_MODES.map((m) => `
            <label class="relative"><input class="peer sr-only" type="radio" name="opt-chat" value="${m.id}"${v.chatMode === m.id ? ' checked' : ''}>
              <span class="seg-item">${icon(m.ic, 'text-xs')} ${esc(t(m.key))}</span></label>`).join('')}
        </div>
      </div>

      <div>
        <span class="label" id="lbl-advance">${esc(t('opt.advance'))}</span>
        <div class="seg" role="radiogroup" aria-labelledby="lbl-advance">
          ${[['auto', 'forward'], ['manual', 'hand-pointer']].map(([id, ic]) => `
            <label class="relative"><input class="peer sr-only" type="radio" name="opt-advance" value="${id}"${(v.advanceMode || 'auto') === id ? ' checked' : ''}>
              <span class="seg-item">${icon(ic, 'text-xs')} ${esc(t(`opt.advance.${id}`))}</span></label>`).join('')}
        </div>
        <p class="hint">${esc(t('opt.advanceHint'))}</p>
      </div>

      <div>
        <span class="label" id="lbl-access">${esc(t('opt.access'))}</span>
        <div class="seg" role="radiogroup" aria-labelledby="lbl-access">
          <label class="relative"><input class="peer sr-only" type="radio" name="opt-access" value="public"${v.isPrivate ? '' : ' checked'}>
            <span class="seg-item">${icon('lock-open', 'text-xs')} ${esc(t('access.public'))}</span></label>
          <label class="relative"><input class="peer sr-only" type="radio" name="opt-access" value="private"${v.isPrivate ? ' checked' : ''}>
            <span class="seg-item">${icon('lock', 'text-xs')} ${esc(t('access.password'))}</span></label>
        </div>
        <div id="opt-pw-wrap" class="${v.isPrivate ? '' : 'hidden'} mt-3">
          <label class="label" for="opt-pw">${esc(t('opt.pwLabel'))}</label>
          <input id="opt-pw" class="input" type="password" autocomplete="new-password" maxlength="32" value="${esc(v.password)}"
            placeholder="${esc(t(edit ? 'opt.pwKeep' : 'opt.pwPh'))}">
          <p class="field-err" data-err="password" role="alert"></p>
        </div>
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between"><label class="label mb-0!" for="opt-time">${esc(t('opt.time'))}</label>
          <span class="text-sm font-medium tabular-nums text-brand"><span data-out="opt-time">${v.selectionTime}</span>${esc(t('common.secs', { n: '' }).trim())}</span></div>
        <input id="opt-time" data-range class="h-8 w-full accent-brand" type="range" min="${c.selectionMin}" max="${c.selectionMax}" step="1" value="${v.selectionTime}">
        <p class="hint">${esc(t('opt.timeHint'))}</p>
        <p class="field-err" data-err="selectionTime" role="alert"></p>
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between"><label class="label mb-0!" for="opt-max">${esc(t('opt.max'))}</label>
          <span class="text-sm font-medium tabular-nums text-brand" data-out="opt-max">${v.maxPlayers}</span></div>
        <input id="opt-max" data-range class="h-8 w-full accent-brand" type="range" min="${c.playersMin}" max="${c.playersMax}" step="1" value="${v.maxPlayers}">
        <p class="hint">${esc(t('opt.maxHint'))}</p>
        <p class="field-err" data-err="maxPlayers" role="alert"></p>
      </div>
    </div>`;
}

function readOptions(root) {
  return {
    name: $('#opt-name', root).value,
    chatMode: ($('input[name="opt-chat"]:checked', root) || {}).value || 'enabled',
    advanceMode: (($('input[name="opt-advance"]:checked', root) || {}).value) === 'manual' ? 'manual' : 'auto',
    isPrivate: (($('input[name="opt-access"]:checked', root) || {}).value) === 'private',
    password: $('#opt-pw', root).value,
    selectionTime: Number($('#opt-time', root).value),
    maxPlayers: Number($('#opt-max', root).value),
  };
}

function showFieldErrors(root, fields) {
  $$('[data-err]', root).forEach((n) => { n.textContent = (fields && fields[n.dataset.err]) || ''; });
}

function clientOptionErrors(v) {
  const e = {};
  const name = v.name.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9 ]{3,24}$/.test(name)) e.name = t('v.name');
  if (v.isPrivate && v.password.length > 0 && (v.password.length < 4 || v.password.length > 32)) e.password = t('v.password');
  return e;
}

function showCreate() {
  S.screen = 'create';
  stopBrowserTimers();
  if (!S.create.values) S.create.values = defaultOptions();
  S.create.step = 1;
  renderCreate();
}

function stepDots(step) {
  const dot = (n, label) => `
    <span class="flex items-center gap-2 text-sm ${step >= n ? 'font-medium text-ink' : 'text-muted'}">
      <span class="flex h-6 w-6 items-center justify-center rounded-full text-xs ${step >= n ? 'bg-brand text-brand-ink' : 'bg-surface2'}">${n}</span>${label}</span>`;
  return `<div class="flex items-center gap-3">${dot(1, esc(t('create.step1')))}<span class="h-px w-6 bg-line"></span>${dot(2, esc(t('create.step2')))}</div>`;
}

function renderCreate() {
  const step = S.create.step;
  const v = S.create.values;
  $('#screen').innerHTML = `
    <section id="create-fit" class="anim-in mx-auto flex max-w-lg flex-col lg:h-full">
      <button class="btn btn-ghost mb-4 min-h-[40px]! shrink-0 self-start" data-act="create-cancel">${icon('arrow-left')} ${esc(t('create.back'))}</button>
      <div class="card flex min-h-0 flex-col lg:flex-1">
        <div class="shrink-0 p-5 pb-0 sm:p-7 sm:pb-0">
          <h1 class="text-2xl font-semibold tracking-tight">${esc(t('create.title'))}</h1>
          <div class="mb-5 mt-3">${stepDots(step)}</div>
        </div>
        ${step === 1 ? `
          <form data-form="create1" class="flex min-h-0 flex-1 flex-col" novalidate>
            <div class="slim-scroll min-h-0 flex-1 px-5 pb-5 sm:px-7 lg:overflow-y-auto">${optionsFormHtml(v, false)}</div>
            <div class="shrink-0 rounded-b-2xl border-t border-line bg-surface px-5 py-4 sm:px-7">
              <button class="btn btn-primary btn-lg w-full" type="submit">${esc(t('create.continue'))} ${icon('arrow-right')}</button>
            </div>
          </form>` : `
          <form data-form="create2" class="flex min-h-0 flex-1 flex-col" novalidate>
            <div class="slim-scroll min-h-0 flex-1 px-5 pb-5 sm:px-7 lg:overflow-y-auto">
              <p class="mb-4 text-sm text-muted">${esc(t('create.intro'))}</p>
              <label class="label" for="phrase">${esc(t('create.phraseLabel'))}</label>
              <div class="relative">
                <input id="phrase" class="input pr-12" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="128" placeholder="${esc(t('create.phrasePh'))}">
                <button type="button" class="icon-btn absolute right-0 top-0" data-act="toggle-phrase" aria-label="${esc(t('create.phraseShow'))}">${icon('eye')}</button>
              </div>
              <p id="phrase-err" class="field-err" role="alert"></p>
            </div>
            <div class="flex shrink-0 gap-2 rounded-b-2xl border-t border-line bg-surface px-5 py-4 sm:px-7">
              <button class="btn btn-ghost btn-lg" type="button" data-act="create-back">${icon('arrow-left')} ${esc(t('create.prev'))}</button>
              <button class="btn btn-primary btn-lg flex-1" type="submit">${icon('plus')} ${esc(t('create.submit'))}</button>
            </div>
          </form>`}
      </div>
    </section>`;
  if (step === 2) { const p = $('#phrase'); if (p && !('ontouchstart' in window)) p.focus(); }
}

forms.create1 = (form) => {
  const v = readOptions(form);
  S.create.values = v;
  const errs = clientOptionErrors(v);
  if (!v.isPrivate) v.password = '';
  if (v.isPrivate && !v.password) errs.password = t('v.passwordSet');
  showFieldErrors(form, errs);
  if (Object.keys(errs).length) { Sound.play('error'); return; }
  S.create.step = 2;
  Sound.play('swoosh');
  renderCreate();
};

forms.create2 = async (form) => {
  const phrase = $('#phrase').value;
  const err = $('#phrase-err');
  const btn = $('button[type=submit]', form);
  err.textContent = '';
  if (!phrase) { err.textContent = t('create.errPhrase'); Sound.play('error'); return; }
  btn.disabled = true;
  const res = await emit('lobby:create', { phrase, options: S.create.values });
  btn.disabled = false;
  if (res.ok) {
    S.create.values = null;
    Sound.play('win');
    enterRoom(res.room);
    return;
  }
  Sound.play('error');
  if (res.code === 'bad_options') {
    S.create.step = 1;
    renderCreate();
    showFieldErrors($('#screen'), localizedFields(res));
    toast(errText(res), 'error');
    return;
  }
  if (res.code === 'wrong_phrase' && res.attemptsLeft > 0) {
    err.textContent = `${errText(res)} ${t('tries.left', { count: res.attemptsLeft })}`;
  } else {
    err.textContent = errText(res, 'create.failed');
  }
  $('#phrase').select();
};

actions.create = () => showCreate();
actions['create-cancel'] = () => showBrowser();
actions['create-back'] = () => { S.create.step = 1; renderCreate(); };
actions['toggle-phrase'] = (el) => {
  const input = $('#phrase');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  el.innerHTML = icon(show ? 'eye-slash' : 'eye');
  el.setAttribute('aria-label', t(show ? 'create.phraseHide' : 'create.phraseShow'));
};
