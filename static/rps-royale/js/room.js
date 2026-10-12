'use strict';
/* Lobby room: header, stage (per game phase), players panel and chat. */

const reasonText = (r) => (r && I18n.has(`reason.${r}`) ? t(`reason.${r}`, { max: S.cfg ? S.cfg.maxStrikes : 3 }) : r || '');
const youTag = () => ` <span class="text-xs font-normal text-muted">${esc(t('common.you'))}</span>`;
const FACT_ICONS = {
  streak: 'fire', strikes: 'heart-crack', common: 'chart-simple', fast: 'bolt',
  eliminated: 'skull', ties: 'handshake', server: 'server', closest: 'bullseye',
};
const SYS_ICONS = {
  join: 'right-to-bracket', leave: 'right-from-bracket', kick: 'user-slash',
  game: 'flag-checkered', admin: 'crown', info: 'circle-info',
};

const myMember = () => S.room && S.room.members.find((m) => m.name === S.me.name);
const amAdmin = () => !!S.room && S.room.adminName === S.me.name;
const connectedCount = (r) => r.members.filter((m) => m.connected).length;

function setHtml(el, html) {
  if (!el || el.__html === html) return false;
  el.innerHTML = html;
  el.__html = html;
  return true;
}

// ============ entering / leaving ============
function enterRoom(payload) {
  stopBrowserTimers();
  closeModal();
  const same = S.screen === 'room' && S.room && S.room.id === payload.state.id;
  S.room = payload.state;
  S.clockOffset = payload.state.serverNow - Date.now();
  S.chat = payload.chat.slice();
  if (same) {
    renderChatAll();
    renderRoomAll();
    return;
  }
  S.screen = 'room';
  S.unread = 0;
  Object.assign(S.ui, { stageKey: null, myPick: null, leftSummary: false, skipSummary: 0, revealDone: 0, summarySound: 0, voted: 0, lastTick: -1, chatCooldownUntil: 0, emoteOpen: false });
  renderRoomShell();
  renderChatAll();
  renderRoomAll();
  Sound.play('join');
}

function leftRoom(toastMsg, kind) {
  S.room = null;
  S.chat = [];
  closeModal();
  if (toastMsg) toast(toastMsg, kind || 'info', 4500);
  showBrowser();
}

actions.leave = () => {
  const r = S.room;
  const m = myMember();
  const playing = r && m && m.alive && (r.phase === 'round' || r.phase === 'roundResult');
  const doLeave = async () => {
    await emit('lobby:leave');
    Sound.play('leave');
    leftRoom();
  };
  if (!playing) return doLeave();
  openModal({
    title: t('leave.title'),
    html: `<p class="text-sm text-muted">${esc(t('leave.text'))}</p>`,
    actions: [
      { label: esc(t('leave.stay')), cls: 'btn-ghost' },
      { label: esc(t('leave.btn')), cls: 'btn-danger', onClick: () => { doLeave(); } },
    ],
  });
};

// ============ shell ============
function renderRoomShell() {
  $('#screen').innerHTML = `
    <section class="anim-in flex flex-col gap-4 lg:h-full">
      <div id="room-head" class="shrink-0"></div>
      <div class="grid items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
        <div id="stage" class="min-w-0 lg:min-h-0"></div>
        <aside class="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <div class="card lg:flex lg:max-h-[45%] lg:min-h-0 lg:shrink lg:flex-col">
            <button class="panel-head md:cursor-default" data-act="panel" data-panel="players" aria-expanded="${S.ui.panels.players}" aria-controls="players-body">
              <span class="flex items-center gap-2">${icon('users', 'text-muted')} <span id="players-title">${esc(t('players.title'))}</span></span>
              <span class="md:hidden"><i class="fa-solid fa-chevron-down text-muted transition ${S.ui.panels.players ? 'rotate-180' : ''}" aria-hidden="true"></i></span>
            </button>
            <div id="players-body" class="${S.ui.panels.players ? '' : 'hidden'} slim-scroll max-h-[28rem] overflow-y-auto px-2 pb-2 md:block! lg:max-h-none lg:min-h-0 lg:flex-1"></div>
          </div>

          <div class="card lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <button class="panel-head md:cursor-default" data-act="panel" data-panel="chat" aria-expanded="${S.ui.panels.chat}" aria-controls="chat-body">
              <span class="flex items-center gap-2">${icon('comments', 'text-muted')} ${esc(t('chat.title'))}
                <span id="chat-badge" class="hidden rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink"></span></span>
              <span class="md:hidden"><i class="fa-solid fa-chevron-down text-muted transition ${S.ui.panels.chat ? 'rotate-180' : ''}" aria-hidden="true"></i></span>
            </button>
            <div id="chat-body" class="${S.ui.panels.chat ? '' : 'hidden'} px-4 pb-4 md:block! lg:flex! lg:min-h-0 lg:flex-1 lg:flex-col">
              <div id="chat-log" class="slim-scroll h-56 overflow-y-auto rounded-xl bg-surface2/60 px-3 py-2 text-sm sm:h-64 lg:h-auto lg:min-h-24 lg:flex-1" role="log" aria-live="polite"></div>
              <div id="chat-locked" class="hidden flex-col items-center gap-2 rounded-xl bg-surface2/60 px-4 py-8 text-center text-sm text-muted">
                ${icon('lock', 'text-lg')}<p>${esc(t('chat.locked'))}</p>
              </div>
              <p id="chat-off" class="mt-2 hidden text-xs text-muted">${icon('comment-slash')} ${esc(t('chat.offNote'))}</p>
              <form id="chat-form" data-form="chat" class="mt-3 hidden shrink-0 space-y-2" novalidate>
                <div id="chat-text-row" class="flex gap-2">
                  <input id="chat-input" class="input" maxlength="${S.cfg.chatMax}" autocomplete="off" placeholder="${esc(t('chat.ph'))}" aria-label="${esc(t('chat.aria'))}" enterkeyhint="send">
                  <button type="button" class="btn btn-ghost w-11 shrink-0 px-0" data-act="emote-toggle" aria-label="${esc(t('chat.emotes.aria'))}" aria-expanded="false">${icon('face-smile')}</button>
                  <button id="chat-send" type="submit" class="btn btn-primary w-11 shrink-0 px-0" aria-label="${esc(t('chat.send'))}">${icon('paper-plane')}</button>
                </div>
                <div id="emote-bar" class="hidden flex-wrap gap-1.5"></div>
              </form>
            </div>
          </div>
        </aside>
      </div>
    </section>`;
  $('#emote-bar').innerHTML = Object.entries(S.cfg.emotes)
    .map(([id, ch]) => `<button type="button" class="btn btn-ghost min-h-[40px]! min-w-[44px] px-2.5! text-lg" data-act="emote" data-id="${esc(id)}" aria-label="${esc(t('emote.aria', { name: t(`emote.${id}`) }))}">${esc(ch)}</button>`)
    .join('');
}

function renderRoomAll() {
  if (S.screen !== 'room' || !S.room) return;
  renderRoomHead();
  renderStage();
  renderPlayers();
  updateChatControls();
}

const PHASE_BADGE = {
  lobby: ['phase.lobby', 'chip-ok', 'hourglass-half'],
  ready: ['phase.ready', 'chip-accent', 'bell'],
  round: ['phase.round', 'chip-brand', 'bolt'],
  roundResult: ['phase.roundResult', 'chip-brand', 'flag-checkered'],
  gameResult: ['phase.gameResult', 'chip-accent', 'trophy'],
};

function renderRoomHead() {
  const r = S.room;
  const [labelKey, cls, ic] = PHASE_BADGE[r.phase];
  const label = t(labelKey);
  const chatIc = CHAT_MODES.find((c) => c.id === r.chatMode).ic;
  const roundTxt = r.round && r.phase !== 'lobby' && r.phase !== 'ready' ? ` · ${t('phase.roundSuffix', { n: r.round })}` : '';
  setHtml($('#room-head'), `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          ${r.isPrivate ? icon('lock', 'text-base text-accent') : ''}<span class="truncate">${esc(r.name)}</span></h1>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span class="chip ${cls}">${icon(ic)} ${esc(label + roundTxt)}</span>
          <span class="chip">${icon('users')} ${connectedCount(r)}/${r.maxPlayers}</span>
          <span class="chip">${icon(chatIc)} ${esc(chatModeText(r.chatMode))}</span>
          <span class="chip">${icon('stopwatch')} ${esc(t('common.secs', { n: r.selectionTime }))}</span>
          ${r.advanceMode === 'manual' ? `<span class="chip">${icon('hand-pointer')} ${esc(t('chip.manual'))}</span>` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        ${amAdmin() ? `<button class="btn btn-ghost" data-act="invite" aria-label="${esc(t('invite.btn'))}">${icon('link')} <span class="hidden sm:inline">${esc(t('invite.btn'))}</span></button>` : ''}
        <button class="btn btn-ghost" data-act="leave">${icon('right-from-bracket')} ${esc(t('leave.btn'))}</button>
      </div>
    </div>`);
}

// ============ stage ============
function stageView() {
  const r = S.room;
  switch (r.phase) {
    case 'ready': return readyView(r);
    case 'round': return roundView(r);
    case 'roundResult':
      if (r.lastResult.gameOver && S.ui.skipSummary === r.lastResult.round) return S.ui.leftSummary ? lobbyView(r) : summaryView(r);
      return resultView(r);
    case 'gameResult': return S.ui.leftSummary ? lobbyView(r) : summaryView(r);
    default: return lobbyView(r);
  }
}

function renderStage() {
  const host = $('#stage');
  if (!host) return;
  const view = stageView();
  if (view.key !== S.ui.stageKey) {
    // Re-draws inside the lobby view (opening settings, someone becoming admin) skip the pop-in so nothing flashes.
    const sameLobby = S.ui.stageKey && S.ui.stageKey.startsWith('lobby|') && view.key.startsWith('lobby|');
    S.ui.stageKey = view.key;
    host.innerHTML = view.html;
    if (host.firstElementChild && !sameLobby) host.firstElementChild.classList.add('anim-in');
    if (view.mounted) view.mounted();
    updateChatControls();
  }
  applyLive(view.live);
  tick();
}

function applyLive(live) {
  for (const [id, v] of Object.entries(live || {})) {
    const n = document.querySelector(`[data-live="${id}"]`);
    if (!n) continue;
    if (v.text !== undefined && n.textContent !== v.text) n.textContent = v.text;
    if (v.html !== undefined && n.__h !== v.html) { n.innerHTML = v.html; n.__h = v.html; }
    if (v.width !== undefined) n.style.width = v.width;
    if (v.disabled !== undefined) n.disabled = v.disabled;
  }
}

// ---- lobby (waiting) ----
function lobbyView(r) {
  const admin = amAdmin();
  const n = connectedCount(r);
  const canStart = n >= 2 && r.phase === 'lobby';
  const open = !!S.ui.settingsOpen && admin;
  const settingsAnim = S.ui.settingsAnim ? 'anim-drop ' : ''; // only the settings card pops when toggled
  S.ui.settingsAnim = false;
  const key = ['lobby', I18n.lang, open, admin, r.phase, r.name, r.chatMode, r.advanceMode, r.isPrivate, r.selectionTime, r.maxPlayers].join('|');
  const hint = n < 2
    ? t('lobbyview.hintFew', { n })
    : t(admin ? 'lobbyview.hintAdmin' : 'lobbyview.hintOther', { n });
  const values = { name: r.name, chatMode: r.chatMode, advanceMode: r.advanceMode, isPrivate: r.isPrivate, password: '', selectionTime: r.selectionTime, maxPlayers: r.maxPlayers };
  const html = `
    <div class="flex flex-col gap-4 lg:h-full">
      <div class="card shrink-0 p-6 text-center sm:p-10">
        <div class="mx-auto mb-5 flex w-fit items-center gap-2" aria-hidden="true">
          ${PICKS.map((p) => `<span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-${p}/10 ${HAND_COLOR[p]}">${hand(p, 'h-6 w-6')}</span>`).join('')}
        </div>
        <h2 class="text-xl font-semibold">${esc(t(admin ? 'lobbyview.admin' : 'lobbyview.waiting'))}</h2>
        <p class="mx-auto mt-1.5 max-w-sm text-sm text-muted" data-live="lobbyHint">${esc(hint)}</p>
        ${admin ? `<button class="btn btn-primary btn-lg mt-6" data-act="start" data-live="startBtn"${canStart ? '' : ' disabled'}>${icon('play')} ${esc(t('lobbyview.start'))}</button>` : ''}
        ${r.phase === 'lobby' ? `<p class="mt-5 text-xs text-muted">${icon('clock')} ${h('lobbyview.closes', {}, { time: '<span class="tabular-nums" data-expiry>--:--</span>' })}</p>` : ''}
      </div>
      ${admin ? `
        <div class="${settingsAnim}card flex flex-col ${open ? 'lg:min-h-[12rem] lg:min-h-0 lg:flex-1' : ''}">
          <button type="button" class="panel-head shrink-0" data-act="toggle-settings" aria-expanded="${open}">
            <span class="flex items-center gap-2">${icon('gear', 'text-muted')} ${esc(t('settings.title'))}</span>
            <i class="fa-solid fa-chevron-down text-muted transition ${open ? 'rotate-180' : ''}" aria-hidden="true"></i>
          </button>
          ${open ? `<form data-form="settings" class="slim-scroll min-h-0 flex-1 border-t border-line p-4 sm:p-5 lg:overflow-y-auto" novalidate>
            ${optionsFormHtml(values, true)}
            <button class="btn btn-primary mt-5 w-full sm:w-auto" type="submit">${icon('check')} ${esc(t('settings.save'))}</button>
          </form>` : ''}
        </div>` : ''}
    </div>`;
  return { key, html, live: { lobbyHint: { text: hint }, startBtn: { disabled: !canStart } } };
}

actions['toggle-settings'] = () => { S.ui.settingsOpen = !S.ui.settingsOpen; S.ui.settingsAnim = true; renderStage(); };

actions.start = async (el) => {
  el.disabled = true;
  const res = await emit('game:start');
  if (!res.ok) { toast(errText(res), 'error'); el.disabled = false; }
};

forms.settings = async (form) => {
  const v = readOptions(form);
  const errs = clientOptionErrors(v);
  showFieldErrors(form, errs);
  if (Object.keys(errs).length) { Sound.play('error'); return; }
  const btn = $('button[type=submit]', form);
  btn.disabled = true;
  const res = await emit('lobby:options', { options: v });
  btn.disabled = false;
  if (res.ok) { toast(t('settings.saved'), 'ok'); Sound.play('pick'); return; }
  showFieldErrors(form, localizedFields(res));
  toast(errText(res), 'error');
};

// ---- ready ----
// "<b>2 of 5</b> ready" with the numbers emphasised
function readyLine(r) {
  const nums = `<span class="font-medium text-ink">${esc(t('common.of', { a: r.readyCount, b: r.poolSize }))}</span>`;
  return h('ready.count', { count: r.readyCount }, { count: nums });
}

function readyView(r) {
  const m = myMember();
  const inPool = !!(m && m.inPool);
  const cta = () => {
    const me = myMember();
    return me && me.ready
      ? `<p class="inline-flex items-center gap-2 rounded-xl bg-ok/10 px-5 py-3 font-medium text-ok">${icon('circle-check')} ${esc(t('ready.you'))}</p>`
      : `<button class="btn btn-primary btn-lg min-w-[10rem]" data-act="ready">${icon('check')} ${esc(t('ready.btn'))}</button>`;
  };
  const key = `ready|${I18n.lang}|${inPool}`;
  const html = `
    <div class="card p-6 text-center sm:p-10">
      <span class="chip chip-accent mb-4">${icon('bell')} ${esc(t(inPool ? 'ready.chip' : 'ready.chipSpec'))}</span>
      <div class="flex justify-center">${timerRing('main', 'h-32 w-32')}</div>
      <h2 class="mt-4 text-2xl font-semibold">${esc(t(inPool ? 'ready.title' : 'ready.titleSpec'))}</h2>
      <p class="mx-auto mt-1.5 max-w-sm text-sm text-muted">${esc(t(inPool ? 'ready.text' : 'ready.textSpec'))}</p>
      ${inPool ? `<div class="mt-6" data-live="readyCta">${cta()}</div>` : ''}
      <p class="mt-5 text-sm text-muted" data-live="readyCount">${readyLine(r)}</p>
    </div>`;
  return { key, html, live: { readyCount: { html: readyLine(r) }, ...(inPool ? { readyCta: { html: cta() } } : {}) } };
}

actions.ready = async (el) => {
  el.disabled = true;
  Sound.play('pick');
  const res = await emit('game:ready');
  if (!res.ok) { toast(errText(res), 'error'); el.disabled = false; }
};

// ---- round (picking) ----
function progressBlock(r) {
  const pct = r.alive ? Math.round((r.picked / r.alive) * 100) : 0;
  return `
    <div class="mx-auto mt-6 max-w-sm text-left">
      <div class="mb-1.5 flex justify-between text-xs text-muted"><span>${esc(t('round.progress'))}</span><span class="font-medium text-ink" data-live="pickText">${esc(t('common.of', { a: r.picked, b: r.alive }))}</span></div>
      <div class="h-2 overflow-hidden rounded-full bg-surface2"><div class="h-full rounded-full bg-brand transition-all duration-300" data-live="pickBar" style="width:${pct}%"></div></div>
    </div>`;
}

function roundView(r) {
  const m = myMember();
  const active = !!(m && m.alive);
  const myPick = S.ui.myPick && S.ui.myPick.round === r.round ? S.ui.myPick.choice : null;
  const picked = active && (m.picked || !!myPick);
  const mode = active ? (picked ? 'locked' : 'pick') : 'watch';
  const key = `round|${I18n.lang}|${r.round}|${mode}`;
  const pct = r.alive ? Math.round((r.picked / r.alive) * 100) : 0;
  const live = {
    alive: { text: t('round.left', { n: r.alive }) },
    pickText: { text: t('common.of', { a: r.picked, b: r.alive }) },
    pickBar: { width: `${pct}%` },
  };
  const top = `
    <div class="mb-4 flex flex-wrap items-center justify-center gap-2">
      <span class="chip chip-brand">${esc(t('round.chip', { n: r.round }))}</span>
      <span class="chip">${icon('users')} <span data-live="alive">${esc(t('round.left', { n: r.alive }))}</span></span>
      ${active ? `<span class="chip">${esc(t('round.strikes'))} ${strikePips(m.strikes || 0, S.cfg.maxStrikes)}</span>` : ''}
    </div>`;
  let body;
  if (mode === 'pick') {
    body = `
      <div class="flex justify-center">${timerRing('main', 'h-28 w-28')}</div>
      <h2 class="mt-4 text-xl font-semibold">${esc(t('round.pickTitle'))}</h2>
      <div class="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3 sm:gap-4">
        ${PICKS.map((p, i) => `
          <button class="tile" data-act="pick" data-choice="${p}" aria-label="${esc(t('round.pickAria', { label: pickLabel(p), n: i + 1 }))}">
            <span class="${HAND_COLOR[p]}">${hand(p, 'h-12 w-12 sm:h-14 sm:w-14')}</span>${esc(pickLabel(p))}
          </button>`).join('')}
      </div>
      <p class="mt-4 hidden text-xs text-muted sm:block">${esc(t('round.kbd'))}</p>`;
  } else if (mode === 'locked') {
    body = `
      <div class="flex justify-center">${timerRing('main', 'h-28 w-28')}</div>
      <h2 class="mt-4 text-xl font-semibold">${icon('lock', 'mr-1 text-base text-brand')} ${esc(t('round.locked'))}</h2>
      ${myPick ? `<div class="mx-auto mt-4 w-32"><div class="tile pointer-events-none ${HAND_RING[myPick]}"><span class="${HAND_COLOR[myPick]}">${hand(myPick, 'h-12 w-12')}</span>${esc(pickLabel(myPick))}</div></div>` : ''}
      <p class="mt-3 text-sm text-muted">${esc(t('round.lockedWait'))}</p>`;
  } else {
    const out = m && m.out;
    body = `
      <div class="flex justify-center">${timerRing('main', 'h-28 w-28')}</div>
      <h2 class="mt-4 text-xl font-semibold">${icon('eye', 'mr-1 text-base text-muted')} ${esc(t('round.watch'))}</h2>
      <p class="mt-1.5 text-sm text-muted">${esc(out ? t('round.watchOut', { n: out.round, reason: reasonText(out.reason) }) : t('round.watchText'))}</p>`;
  }
  const html = `<div class="card p-5 text-center sm:p-8">${top}${body}${progressBlock(r)}</div>`;
  return { key, html, live };
}

actions.pick = async (el) => {
  const r = S.room;
  const choice = el.dataset.choice;
  if (!r || r.phase !== 'round' || !PICKS.includes(choice)) return;
  if (S.ui.myPick && S.ui.myPick.round === r.round) return;
  S.ui.myPick = { round: r.round, choice };
  Sound.play('pick');
  renderStage();
  updateChatControls();
  const res = await emit('game:pick', { choice });
  if (!res.ok && res.code !== 'already_picked') {
    S.ui.myPick = null;
    toast(errText(res), 'error');
    renderStage();
    updateChatControls();
  }
};

document.addEventListener('keydown', (e) => {
  if (S.screen !== 'room' || !S.room || S.room.phase !== 'round' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
  const map = { 1: 'rock', 2: 'paper', 3: 'scissors' };
  const choice = map[e.key.toLowerCase()];
  const m = myMember();
  if (choice && m && m.alive && $('[data-act="pick"]')) actions.pick({ dataset: { choice } });
});

// ---- round results ----
function outcomeMsg(e, res) {
  const max = S.cfg.maxStrikes;
  if (!e) return { tone: 'text-muted', title: t('out.watchTitle'), sub: t('out.watchSub') };
  const sp = pickLower(res.serverPick);
  switch (e.outcome) {
    case 'win': return { tone: 'text-ok', title: t('out.winTitle'), sub: beatsText(e.pick, res.serverPick) };
    case 'tie':
      return e.eliminated
        ? { tone: 'text-danger', title: t('out.tie3Title'), sub: t('out.tie3Sub', { pick: sp }) }
        : { tone: 'text-warn', title: t('out.tieTitle', { n: e.strikes, max }), sub: t('out.tieSub', { pick: sp }) };
    case 'lose': return { tone: 'text-danger', title: t('out.loseTitle'), sub: beatsText(res.serverPick, e.pick) };
    case 'timeout': return { tone: 'text-danger', title: t('out.timeoutTitle'), sub: t('out.timeoutSub') };
    default: return { tone: 'text-muted', title: t('out.leftTitle'), sub: '' };
  }
}

function outcomeBadge(e) {
  const max = S.cfg.maxStrikes;
  switch (e.outcome) {
    case 'win': return `<span class="chip chip-ok">${icon('check')} ${esc(t('badge.survived'))}</span>`;
    case 'tie': return e.eliminated
      ? `<span class="chip chip-danger">${icon('xmark')} ${esc(t('badge.strikes', { max }))}</span>`
      : `<span class="chip chip-warn">${icon('handshake')} ${esc(t('badge.tie', { n: e.strikes, max }))}</span>`;
    case 'lose': return `<span class="chip chip-danger">${icon('xmark')} ${esc(t('badge.out'))}</span>`;
    case 'timeout': return `<span class="chip chip-danger">${icon('hourglass-end')} ${esc(t('badge.slow'))}</span>`;
    default: return `<span class="chip">${icon('right-from-bracket')} ${esc(t('badge.left'))}</span>`;
  }
}

function resultView(r) {
  const res = r.lastResult;
  const mine = res.entries.find((e) => e.name === S.me.name);
  const msg = outcomeMsg(mine, res);
  const instant = S.ui.revealDone === res.round;
  const hid = instant ? 'reveal-show' : 'reveal-hidden';
  const totalPicks = res.pickCounts.rock + res.pickCounts.paper + res.pickCounts.scissors;
  const rows = res.entries.slice().sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.name.localeCompare(b.name));
  const finalRound = res.gameOver;
  const st = res.stats;
  const manual = r.advanceMode === 'manual';
  const admin = amAdmin();
  const nextHtml = () => {
    if (finalRound) return { html: `${icon('trophy')} ${esc(t('next.final'))}`, disabled: false, show: true };
    if (manual) return { html: `${esc(t('next.btn'))} ${icon('forward')}`, disabled: false, show: admin };
    const voted = S.ui.voted === res.round;
    return voted ? { html: `${icon('hourglass-half')} ${esc(t('next.wait'))}`, disabled: true, show: true } : { html: `${esc(t('next.btn'))} ${icon('forward')}`, disabled: false, show: true };
  };
  const nextInfo = () => {
    const v = S.room.votes;
    if (manual) return esc(t(admin ? 'next.adminHint' : finalRound ? 'next.selfPace' : 'next.waitAdmin'));
    const clockHtml = '<span class="tabular-nums" data-clock>10</span>';
    if (finalRound) return h('next.finalIn', {}, { clock: clockHtml });
    return h('next.in', {}, { clock: clockHtml }) + (v && v.count ? ` · ${esc(t('votes.ready', { count: v.count, needed: v.needed }))}` : '');
  };
  const nb = nextHtml();

  const html = `
    <div class="card stage-split flex flex-col">
     <div class="shrink-0 p-5 pb-0 sm:p-7 sm:pb-0">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip chip-brand">${esc(t('result.title', { n: res.round }))}</span>
        ${finalRound ? `<span class="chip chip-accent">${icon('flag-checkered')} ${esc(t('result.final'))}</span>` : ''}
      </div>

      <div class="mt-5 flex items-center gap-4 sm:gap-6">
        <div id="srv-pick" class="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-surface2 text-4xl font-semibold text-muted sm:h-28 sm:w-28" aria-label="${esc(t('result.serverAria'))}">?</div>
        <div class="min-w-0">
          <p class="text-sm text-muted">${esc(t('result.serverPicked'))}</p>
          <p class="${hid} text-3xl font-semibold ${HAND_COLOR[res.serverPick]}" id="srv-name">${esc(pickLabel(res.serverPick))}</p>
          <p class="${hid} mt-1 text-lg font-medium ${msg.tone}" id="my-outcome">${esc(msg.title)}</p>
          <p class="${hid} text-sm text-muted">${esc(msg.sub)}</p>
        </div>
      </div>

     </div>

      <div class="${hid} slim-scroll min-h-0 flex-1 space-y-6 px-5 pb-5 pt-6 sm:px-7 lg:overflow-y-auto" id="reveal-body">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="stat"><p class="text-2xl font-semibold text-ok">${st.survivors}</p><p class="text-xs text-muted">${esc(t('stat.in'))}</p></div>
          <div class="stat"><p class="text-2xl font-semibold text-warn">${st.ties}</p><p class="text-xs text-muted">${esc(t('stat.tied'))}</p></div>
          <div class="stat"><p class="text-2xl font-semibold text-danger">${st.eliminated}</p><p class="text-xs text-muted">${esc(t('stat.elim'))}</p></div>
          <div class="stat"><p class="text-2xl font-semibold">${st.timeouts}</p><p class="text-xs text-muted">${esc(t('stat.slow'))}</p></div>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium">${esc(t('result.picked'))}</h3>
          <div class="space-y-2">
            ${PICKS.map((p) => {
              const c = res.pickCounts[p];
              const pct = totalPicks ? Math.round((c / totalPicks) * 100) : 0;
              return `<div class="flex items-center gap-3 text-sm">
                <span class="flex w-24 items-center gap-2 ${HAND_COLOR[p]}">${hand(p, 'h-5 w-5')}<span class="text-ink">${esc(pickLabel(p))}</span></span>
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface2"><div class="h-full rounded-full bg-${p}" style="width:${pct}%"></div></div>
                <span class="w-6 text-right tabular-nums text-muted">${c}</span></div>`;
            }).join('')}
          </div>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium">${esc(t('result.results'))}</h3>
          <ul class="slim-scroll max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            ${rows.map((e) => `
              <li class="flex items-center gap-3 px-3 py-2.5 ${e.name === S.me.name ? 'bg-brand/5' : ''}">
                ${avatar(e.name)}
                <span class="min-w-0 flex-1 truncate font-medium">${esc(e.name)}${e.name === S.me.name ? youTag() : ''}</span>
                <span class="hidden items-center gap-1.5 text-sm text-muted sm:flex">${e.pick ? `<span class="${HAND_COLOR[e.pick]}">${hand(e.pick, 'h-5 w-5')}</span>${esc(pickLabel(e.pick))}` : '—'}</span>
                <span class="sm:hidden ${e.pick ? HAND_COLOR[e.pick] : 'text-muted'}">${e.pick ? hand(e.pick, 'h-5 w-5') : '—'}</span>
                ${outcomeBadge(e)}
              </li>`).join('')}
          </ul>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium">${esc(t('result.elimTitle'))}</h3>
          ${res.eliminated.length
            ? `<div class="flex flex-wrap gap-1.5">${res.eliminated.map((x) => `<span class="chip chip-danger">${icon('skull')} ${esc(x.name)} · ${esc(reasonText(x.reason))}</span>`).join('')}</div>`
            : `<p class="text-sm text-muted">${esc(t('result.nobody'))}</p>`}
        </div>
      </div>

      <div class="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 rounded-b-2xl border-t border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:px-7">
        <div class="flex-1">
          ${manual ? '' : '<div class="h-1.5 overflow-hidden rounded-full bg-surface2"><div class="h-full rounded-full bg-brand" data-bar="main" style="width:100%"></div></div>'}
          <p class="${manual ? '' : 'mt-1.5 '}text-xs text-muted" data-live="nextInfo">${nextInfo()}</p>
        </div>
        ${nb.show ? `<button class="btn btn-primary" data-act="next" data-live="nextBtn"${nb.disabled ? ' disabled' : ''}>${nb.html}</button>` : ''}
      </div>
    </div>`;

  return {
    key: `result|${I18n.lang}|${r.advanceMode}|${admin}|${res.round}`,
    html,
    live: { nextInfo: { html: nextInfo() }, nextBtn: { html: nb.html, disabled: nb.disabled } },
    mounted: () => runReveal(res, mine, `result|${I18n.lang}|${r.advanceMode}|${admin}|${res.round}`),
  };
}

function runReveal(res, mine, key) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = (sound) => {
    if (S.ui.stageKey !== key) return;
    S.ui.revealDone = res.round;
    const box = $('#srv-pick');
    if (box) {
      box.className = `anim-land flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-${res.serverPick}/10 sm:h-28 sm:w-28 ${HAND_COLOR[res.serverPick]}`;
      box.innerHTML = hand(res.serverPick, 'h-14 w-14');
    }
    $$('.reveal-hidden', $('#stage')).forEach((n) => { n.classList.remove('reveal-hidden'); n.classList.add('reveal-show'); });
    if (sound) {
      Sound.play('land');
      const o = mine ? mine.outcome : null;
      setTimeout(() => {
        if (o === 'win') Sound.play('survive');
        else if (o === 'tie') Sound.play(mine.eliminated ? 'out' : 'tie');
        else if (o === 'lose' || o === 'timeout') Sound.play('out');
      }, 280);
    }
  };
  if (S.ui.revealDone === res.round) { finish(false); return; }
  if (reduce) { finish(true); return; }
  Sound.play('reveal');
  let i = 0;
  const iv = setInterval(() => {
    const box = $('#srv-pick');
    if (!box || S.ui.stageKey !== key) return clearInterval(iv);
    box.innerHTML = hand(PICKS[i++ % 3], 'h-14 w-14 opacity-60');
  }, 110);
  setTimeout(() => { clearInterval(iv); finish(true); }, 1250);
}

actions.next = async (el) => {
  const r = S.room;
  if (!r) return;
  const onSummary = r.phase === 'gameResult' || (r.phase === 'roundResult' && r.lastResult.gameOver && S.ui.skipSummary === r.lastResult.round);
  if (r.advanceMode === 'manual' && onSummary && !amAdmin()) {
    // Manual mode: a player can leave the summary on their own and wait in the lobby view.
    S.ui.leftSummary = true;
    renderStage();
    updateChatControls();
    return;
  }
  if (r.phase === 'roundResult' && r.lastResult.gameOver) {
    S.ui.skipSummary = r.lastResult.round;
    emit('game:next'); // in manual mode this moves everyone on, but only if you are the admin
    renderStage();
    return;
  }
  const round = r.lastResult ? r.lastResult.round : 0;
  S.ui.voted = r.phase === 'gameResult' ? 'g' : round;
  el.disabled = true;
  const res = await emit('game:next');
  if (!res.ok) { S.ui.voted = 0; el.disabled = false; toast(errText(res), 'error'); }
  renderStage();
};

// ---- game summary ----
function summaryView(r) {
  const sum = r.summary;
  const won = sum.winner === S.me.name;
  const footer = () => {
    const r2 = S.room;
    if (r2.advanceMode === 'manual') {
      return `
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p class="flex-1 text-xs text-muted">${icon('hand-pointer')} ${esc(t(amAdmin() ? 'next.adminHint' : 'next.selfPace'))}</p>
          <button class="btn btn-primary" data-act="next">${icon('arrow-left')} ${esc(t('sum.back'))}</button>
        </div>`;
    }
    if (r2.phase !== 'gameResult') {
      return `<p class="text-center text-sm text-muted sm:text-left">${icon('clock')} ${esc(t('sum.soon'))}</p>`;
    }
    const voted = S.ui.voted === 'g';
    const v = r2.votes;
    return `
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex-1">
          <div class="h-1.5 overflow-hidden rounded-full bg-surface2"><div class="h-full rounded-full bg-brand" data-bar="main" style="width:100%"></div></div>
          <p class="mt-1.5 text-xs text-muted">${h('sum.backIn', {}, { clock: '<span class="tabular-nums" data-clock>10</span>' })}${v && v.count ? ` · ${esc(t('votes.ready', { count: v.count, needed: v.needed }))}` : ''}</p>
        </div>
        <button class="btn btn-primary" data-act="next"${voted ? ' disabled' : ''}>${voted ? `${icon('hourglass-half')} ${esc(t('next.wait'))}` : `${icon('arrow-left')} ${esc(t('sum.back'))}`}</button>
      </div>`;
  };
  const maxTie = (f) => Math.max(1, ...(f.series || [0]));
  const facts = sum.facts.map((f) => `
    <div class="stat">
      <div class="flex items-center gap-2 text-xs text-muted"><span class="text-accent">${icon(FACT_ICONS[f.id] || 'star')}</span>${esc(fact(f).label)}</div>
      <p class="mt-1 text-xl font-semibold">${esc(fact(f).value)}</p>
      <p class="text-xs text-muted">${esc(fact(f).detail)}</p>
      ${f.series && f.series.length > 1 ? `<div class="mt-2 flex h-8 items-end gap-1" aria-hidden="true">${f.series.map((n) => `<span class="min-h-[3px] flex-1 rounded-xs bg-accent/70" style="height:${Math.max(8, (n / maxTie(f)) * 100)}%"></span>`).join('')}</div>` : ''}
    </div>`).join('');
  const standings = sum.standings.map((p, i) => `
    <li class="flex items-center gap-3 px-3 py-2.5 ${p.name === S.me.name ? 'bg-brand/5' : ''}">
      <span class="w-5 text-center text-sm tabular-nums text-muted">${p.alive ? icon('trophy', 'text-warn') : i + 1}</span>
      ${avatar(p.name)}
      <span class="min-w-0 flex-1 truncate font-medium">${esc(p.name)}${p.name === S.me.name ? youTag() : ''}</span>
      <span class="text-xs text-muted">${esc(p.alive ? t('sum.winner') : t('sum.outIn', { n: p.eliminatedRound, reason: reasonText(p.reason) }))}</span>
    </li>`).join('');

  const html = `
    <div class="card stage-split flex flex-col">
      <div class="shrink-0 rounded-t-2xl bg-linear-to-br from-brand/15 via-transparent to-accent/15 px-6 py-8 text-center sm:py-10">
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${sum.winner ? 'bg-warn/15 text-warn' : 'bg-surface2 text-muted'} text-2xl">${icon(sum.winner ? 'trophy' : 'robot')}</span>
        <h2 class="mt-4 text-3xl font-semibold tracking-tight">${esc(sum.winner ? (won ? t('sum.youWin') : t('sum.wins', { name: sum.winner })) : t('sum.none'))}</h2>
        <p class="mt-1.5 text-sm text-muted">${esc(sum.winner ? t(won ? 'sum.youWinSub' : 'sum.winsSub') : t('sum.noneSub'))}</p>
        <div class="mt-4 flex flex-wrap justify-center gap-1.5">
          <span class="chip">${icon('flag-checkered')} ${esc(t('sum.rounds', { count: sum.rounds }))}</span>
          <span class="chip">${icon('users')} ${esc(t('sum.players', { count: sum.participants }))}</span>
        </div>
      </div>
      <div class="slim-scroll min-h-0 flex-1 space-y-6 p-5 sm:p-7 lg:overflow-y-auto">
        <div>
          <h3 class="mb-2 text-sm font-medium">${esc(t('sum.stats'))}</h3>
          <div class="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">${facts}</div>
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium">${esc(t('sum.standings'))}</h3>
          <ul class="slim-scroll max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line">${standings}</ul>
        </div>
      </div>
      <div data-live="sumFooter" class="sticky bottom-0 z-10 shrink-0 rounded-b-2xl border-t border-line bg-surface px-5 py-4 sm:px-7"></div>
    </div>`;
  return {
    key: `summary|${I18n.lang}|${r.advanceMode}|${amAdmin()}|${r.lastResult ? r.lastResult.round : 0}`,
    html,
    live: { sumFooter: { html: footer() } },
    mounted: () => {
      const rn = r.lastResult ? r.lastResult.round : 0;
      if (S.ui.summarySound === rn) return;
      S.ui.summarySound = rn;
      Sound.play(won ? 'win' : sum.winner ? 'swoosh' : 'lose');
    },
  };
}

// ============ players panel ============
function playerRow(m, r) {
  const you = m.name === S.me.name;
  const inGame = r.phase !== 'lobby';
  let status = '';
  if (!m.connected) status += `<span class="text-warn" title="${esc(t('p.disconnected'))}">${icon('plug-circle-xmark')}</span>`;
  if (r.phase === 'ready' && m.inPool) {
    status += m.ready ? `<span class="text-ok" title="${esc(t('p.ready'))}">${icon('circle-check')}</span>` : `<span class="anim-pulse text-muted" title="${esc(t('p.notReady'))}">${icon('hourglass-half')}</span>`;
  }
  if (r.phase === 'round' && m.alive) {
    status += m.picked ? `<span class="text-ok" title="${esc(t('p.locked'))}">${icon('circle-check')}</span>` : `<span class="anim-pulse text-muted" title="${esc(t('p.choosing'))}">${icon('hourglass-half')}</span>`;
  }
  if (inGame && m.alive && r.phase !== 'ready') status += strikePips(m.strikes || 0, S.cfg.maxStrikes);
  const sub = m.role === 'spectator' && m.out ? `<span class="text-xs text-muted">${esc(t('p.out', { n: m.out.round }))}</span>` : '';
  const kick = amAdmin() && !you
    ? `<button class="icon-btn h-9! w-9!" data-act="kick" data-name="${esc(m.name)}" aria-label="${esc(t('kick.aria', { name: m.name }))}">${icon('user-xmark')}</button>` : '';
  return `
    <li class="flex min-h-[48px] items-center gap-3 rounded-xl px-2 py-1.5 ${you ? 'bg-brand/5' : ''}">
      ${avatar(m.name)}
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 truncate font-medium">
          <span class="truncate">${esc(m.name)}</span>${you ? youTag() : ''}
          ${m.isAdmin ? `<span class="text-warn" title="${esc(t('p.admin'))}">${icon('crown', 'text-xs')}</span>` : ''}</p>
        ${sub}
      </div>
      <div class="flex items-center gap-2 text-sm">${status}</div>
      ${kick}
    </li>`;
}

function renderPlayers() {
  const r = S.room;
  $('#players-title').textContent = t('players.titleN', { n: connectedCount(r) });
  const players = r.members.filter((m) => m.role === 'player');
  const specs = r.members.filter((m) => m.role === 'spectator');
  const group = (title, list) => list.length ? `
    <p class="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">${esc(title)} · ${list.length}</p>
    <ul>${list.map((m) => playerRow(m, r)).join('')}</ul>` : '';
  let html;
  if (r.phase === 'lobby') html = group(t('group.lobby'), players);
  else html = group(t(r.phase === 'gameResult' ? 'group.standing' : 'group.playing'), players) + group(t('group.spec'), specs);
  setHtml($('#players-body'), html);
}

actions.kick = (el) => {
  const name = el.dataset.name;
  openModal({
    title: t('kick.title', { name }),
    html: `<p class="text-sm text-muted">${esc(t('kick.text'))}</p>`,
    actions: [
      { label: esc(t('common.cancel')), cls: 'btn-ghost' },
      {
        label: esc(t('kick.btn')), cls: 'btn-danger',
        onClick: async () => {
          const res = await emit('lobby:kick', { name });
          if (!res.ok) toast(errText(res), 'error');
          else Sound.play('kick');
        },
      },
    ],
  });
};

actions.panel = (el) => {
  const p = el.dataset.panel;
  S.ui.panels[p] = !S.ui.panels[p];
  const body = $(`#${p}-body`);
  body.classList.toggle('hidden', !S.ui.panels[p]);
  el.setAttribute('aria-expanded', String(S.ui.panels[p]));
  $('i.fa-chevron-down', el).classList.toggle('rotate-180', S.ui.panels[p]);
  if (p === 'chat' && S.ui.panels.chat) {
    S.unread = 0;
    updateChatBadge();
    const log = $('#chat-log');
    log.scrollTop = log.scrollHeight;
  }
};

// ============ chat ============
// System lines arrive as { key, params } so they can be shown in the viewer's language.
function sysText(m) {
  if (!m.key) return m.text;
  let key = `sys.${m.key}`;
  const p = { ...(m.params || {}) };
  if (m.key === 'roundDone') {
    if (!p.out) key = 'sys.roundDoneNone';
    p.pick = pickLower(p.pick);
    p.count = p.out; // picks the singular/plural form
  }
  return I18n.has(key) || I18n.has(`${key}.other`) ? t(key, p) : m.text;
}

// Fun-fact cards: the server sends the numbers (f.p); the words come from the language file.
function fact(f) {
  const p = f.p;
  if (!p) return f;
  const names = (a) => a.join(', ');
  const picks = (a) => a.map(pickLabel).join(', ');
  const pre = `fact.${f.id}`;
  switch (f.id) {
    case 'streak': return { label: t(`${pre}.label`), value: t(`${pre}.value`, { count: p.n }), detail: names(p.names) };
    case 'strikes': return { label: t(`${pre}.label`), value: t(`${pre}.value`, { count: p.n }), detail: names(p.names) };
    case 'common': return { label: t(`${pre}.label`), value: picks(p.picks), detail: t(`${pre}.detail`, p) };
    case 'fast': return { label: t(`${pre}.label`), value: t('common.secs', { n: p.secs }), detail: t(`${pre}.detail`, p) };
    case 'eliminated': return { label: t(`${pre}.label`), value: t(`${pre}.value`, p), detail: t(`${pre}.detail`, { ...p, max: p.max }) };
    case 'ties': return { label: t(`${pre}.label`), value: String(p.n), detail: t(p.rounds > 1 ? `${pre}.perRound` : `${pre}.oneRound`) };
    case 'server': return { label: t(`${pre}.label`), value: picks(p.picks), detail: t(`${pre}.detail`, p) };
    case 'closest': return p.n === 0
      ? { label: t(`${pre}.label`), value: t(`${pre}.flawless`), detail: t(`${pre}.flawlessDetail`) }
      : { label: t(`${pre}.label`), value: t('fact.strikes.value', { count: p.n }), detail: t(`${pre}.detail`, p) };
    default: return f;
  }
}

function chatLine(m) {
  const mine = m.name === S.me.name;
  if (m.type === 'system') {
    return `<p class="py-1 text-center text-xs text-muted">${icon(SYS_ICONS[m.kind] || 'circle-info', 'mr-1')}${esc(sysText(m))}</p>`;
  }
  const nm = `<span class="font-medium ${mine ? 'text-brand' : ''}">${esc(m.name)}</span>`;
  if (m.type === 'emote') return `<p class="py-0.5">${nm} <span class="align-middle text-2xl">${esc(m.text)}</span></p>`;
  return `<p class="break-words py-0.5">${nm} <span class="text-ink/90">${esc(m.text)}</span></p>`;
}

function renderChatAll() {
  const log = $('#chat-log');
  if (!log) return;
  log.innerHTML = S.chat.map(chatLine).join('');
  log.scrollTop = log.scrollHeight;
}

function appendChat(msg) {
  S.chat.push(msg);
  if (S.chat.length > 100) S.chat.shift();
  const log = $('#chat-log');
  if (!log) return;
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.insertAdjacentHTML('beforeend', chatLine(msg));
  while (log.children.length > 100) log.firstElementChild.remove();
  if (near) log.scrollTop = log.scrollHeight;
}

function chatLocked() {
  const r = S.room;
  const m = myMember();
  return !!(r && m && r.phase === 'round' && m.alive && !m.picked && !(S.ui.myPick && S.ui.myPick.round === r.round));
}

function updateChatBadge() {
  const b = $('#chat-badge');
  if (!b) return;
  b.textContent = S.unread > 9 ? '9+' : String(S.unread);
  b.classList.toggle('hidden', S.unread === 0);
}

function updateChatControls() {
  const r = S.room;
  if (!r || !$('#chat-form')) return;
  const locked = chatLocked();
  const mode = r.chatMode;
  const lockedEl = $('#chat-locked');
  lockedEl.classList.toggle('hidden', !locked);
  lockedEl.classList.toggle('flex', locked);
  $('#chat-log').classList.toggle('hidden', locked);
  $('#chat-off').classList.toggle('hidden', mode !== 'disabled');
  $('#chat-form').classList.toggle('hidden', locked || mode === 'disabled');
  $('#chat-text-row').classList.toggle('hidden', mode !== 'enabled');
  const bar = $('#emote-bar');
  const showBar = mode === 'emotes' || (mode === 'enabled' && S.ui.emoteOpen);
  bar.classList.toggle('hidden', !showBar);
  bar.classList.toggle('flex', showBar);
  const input = $('#chat-input');
  if (input) input.maxLength = S.cfg.chatMax;
}

function startChatCooldown() {
  S.ui.chatCooldownUntil = Date.now() + S.cfg.chatIntervalMs;
  const send = $('#chat-send');
  if (send) send.disabled = true;
  $$('#emote-bar button').forEach((b) => { b.disabled = true; });
  setTimeout(() => {
    const s = $('#chat-send');
    if (s) s.disabled = false;
    $$('#emote-bar button').forEach((b) => { b.disabled = false; });
  }, S.cfg.chatIntervalMs);
}

async function sendChat(payload) {
  if (Date.now() < S.ui.chatCooldownUntil) return false;
  const res = await emit('chat:send', payload);
  if (res.ok) { startChatCooldown(); return true; }
  if (res.code === 'slow_down') startChatCooldown();
  else toast(errText(res), 'error');
  return false;
}

forms.chat = async () => {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (await sendChat({ text })) input.value = '';
};

actions.emote = (el) => { sendChat({ emote: el.dataset.id }); };
actions['emote-toggle'] = (el) => {
  S.ui.emoteOpen = !S.ui.emoteOpen;
  el.setAttribute('aria-expanded', String(S.ui.emoteOpen));
  updateChatControls();
};

function onChatMessage(msg) {
  if (!S.room) return;
  appendChat(msg);
  const mine = msg.name === S.me.name;
  if (msg.type === 'system') {
    if (msg.kind === 'join') Sound.play('join');
    else if (msg.kind === 'leave') Sound.play('leave');
    else if (msg.kind === 'kick') Sound.play('kick');
    return;
  }
  if (mine || chatLocked()) return;
  Sound.play('chat');
  const collapsed = window.innerWidth < 768 && !S.ui.panels.chat;
  if (collapsed) { S.unread += 1; updateChatBadge(); }
}

// ============ state updates ============
function onRoomState(next) {
  const prev = S.room;
  if (!prev || prev.id !== next.id) return;
  S.room = next;
  S.clockOffset = next.serverNow - Date.now();
  if (prev.phase !== next.phase || prev.round !== next.round) onPhaseChange(prev, next);
  if (prev.adminName !== next.adminName && next.adminName === S.me.name) {
    S.ui.leftSummary = false; // the admin needs the summary screen to move everyone on
    toast(t('toast.admin'), 'ok');
    Sound.play('alert');
  }
  renderRoomAll();
}

function onPhaseChange(prev, next) {
  const m = next.members.find((x) => x.name === S.me.name);
  S.ui.lastTick = -1;
  if (next.phase === 'ready' && m && m.inPool) Sound.play('alert');
  if (next.phase === 'round') {
    Sound.play('go');
    if (S.ui.myPick && S.ui.myPick.round !== next.round) S.ui.myPick = null;
  }
  if (next.phase === 'roundResult' || next.phase === 'gameResult') S.ui.voted = 0;
  if (next.phase === 'ready' || next.phase === 'lobby' || next.phase === 'round') S.ui.leftSummary = false;
  if (next.phase === 'lobby' && prev.phase !== 'lobby') {
    S.ui.skipSummary = 0;
    S.ui.myPick = null;
    Sound.play('swoosh');
  }
}

// ============ clock ============
function tick() {
  const r = S.room;
  if (S.screen !== 'room' || !r) return;
  const now = serverNow();
  const remaining = r.phaseEndsAt ? Math.max(0, r.phaseEndsAt - now) : 0;
  const total = r.phase === 'ready' || r.phase === 'round' ? r.selectionTime * 1000
    : r.phase === 'roundResult' ? S.cfg.resultMs
    : r.phase === 'gameResult' ? S.cfg.gameResultMs : 1;
  const secs = Math.ceil(remaining / 1000);
  const C = 2 * Math.PI * 44;

  $$('[data-secs]').forEach((n) => { n.textContent = String(secs); });
  $$('[data-ring-fg]').forEach((c) => {
    c.style.strokeDashoffset = String(C * (1 - Math.min(1, remaining / total)));
    c.closest('[data-ring-wrap]').classList.toggle('ring-low', remaining <= 3000);
  });
  $$('[data-bar]').forEach((b) => { b.style.width = `${Math.min(100, (remaining / total) * 100)}%`; });
  $$('[data-clock]').forEach((n) => { n.textContent = String(secs); });
  $$('[data-expiry]').forEach((n) => { n.textContent = r.expiresAt ? clock(r.expiresAt - now) : '--:--'; });

  // Countdown ticks for the last three seconds, only when it is on you to act.
  const m = myMember();
  const waitingOnMe = m && ((r.phase === 'ready' && m.inPool && !m.ready) ||
    (r.phase === 'round' && m.alive && !m.picked && !(S.ui.myPick && S.ui.myPick.round === r.round)));
  if (waitingOnMe && secs >= 1 && secs <= 3 && secs !== S.ui.lastTick) {
    S.ui.lastTick = secs;
    Sound.play('tick');
  }
}
