'use strict';
/* Boot, session handling and global event wiring. */

async function bootSession() {
  const token = store.get('rps-token', '');
  if (!token) {
    S.me = null;
    renderChrome();
    if (S.screen !== 'start') showStart();
    return;
  }
  const res = await emit('session:resume', { token });
  if (!res.ok) {
    if (res.code === 'expired') {
      store.del('rps-token');
      const wasIn = S.screen !== 'boot' && S.screen !== 'start';
      S.me = null;
      S.room = null;
      renderChrome();
      showStart(wasIn ? t('start.expired') : '');
    } else {
      showConn(errText(res, 'conn.noreach'));
    }
    return;
  }
  S.me = { name: res.name };
  S.cfg = res.config;
  renderChrome();
  if (res.room) {
    if (S.pendingJoin && S.pendingJoin !== res.room.state.id) toast(t('join.alreadyIn'), 'error');
    S.pendingJoin = null;
    clearInviteHash();
    enterRoom(res.room);
  } else if (S.screen === 'room') {
    leftRoom(t('toast.gone'));
  } else if (S.screen === 'boot' || S.screen === 'start' || S.screen === 'replaced') {
    goAfterLogin();
  } else if (S.screen === 'browser') {
    refreshLobbies();
  }
}

function showReplaced() {
  S.screen = 'replaced';
  S.room = null;
  stopBrowserTimers();
  closeModal();
  $('#screen').innerHTML = `
    <section class="anim-in mx-auto max-w-md pt-8">
      <div class="card flex flex-col items-center gap-3 p-8 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-warn/15 text-warn">${icon('clone', 'text-xl')}</span>
        <h1 class="text-xl font-semibold">${esc(t('replaced.title'))}</h1>
        <p class="text-sm text-muted">${esc(t('replaced.text'))}</p>
        <button class="btn btn-primary mt-2" data-act="reconnect">${esc(t('replaced.btn'))}</button>
      </div>
    </section>`;
}
actions.reconnect = () => socket.connect();

// ---- socket events ----
socket.on('connect', () => {
  S.online = true;
  showConn('');
  bootSession();
});
socket.on('disconnect', (reason) => {
  S.online = false;
  if (reason === 'io client disconnect' || S.screen === 'replaced') return;
  showConn(t('conn.lost'));
});
socket.on('connect_error', () => showConn(t('conn.cannot')));
socket.on('room:state', onRoomState);
socket.on('chat:msg', onChatMessage);
socket.on('lobby:kicked', (d) => {
  Sound.play('kick');
  leftRoom(d && d.lobby ? t('toast.kicked', { lobby: d.lobby }) : t('toast.kickedGeneric'), 'error');
});
socket.on('lobby:closed', (d) => {
  leftRoom(t(d && d.reason === 'expired' ? 'toast.expired' : 'toast.closed'));
});
socket.on('session:replaced', showReplaced);

// ---- delegated DOM events ----
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.closest('button')) Sound.play('tap');
    return;
  }
  if (el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  Sound.unlock();
  if (el.dataset.act !== 'pick' && el.dataset.act !== 'sound') Sound.play('tap');
  fn(el, e);
});

document.addEventListener('submit', (e) => {
  const name = e.target.dataset && e.target.dataset.form;
  if (!name || !forms[name]) return;
  e.preventDefault();
  Sound.unlock();
  forms[name](e.target, e);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('[data-range]')) {
    const out = $(`[data-out="${el.id}"]`);
    if (out) out.textContent = el.value;
  }
  if (el.matches('[data-filter]') && el.type !== 'checkbox' && el.tagName !== 'SELECT') onFilterInput(el);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-filter]')) onFilterInput(el);
  if (el.matches('input[name="opt-access"]')) $('#opt-pw-wrap').classList.toggle('hidden', el.value !== 'private');
  if (el.matches('[data-lang]')) changeLanguage(el.value);
});

// Browsers only allow audio after a gesture, so unlock on the first one.
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => Sound.unlock(), { passive: true }));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.screen === 'browser' && S.online) refreshLobbies();
});

// An invite link opened (or pasted) while the app is already running.
window.addEventListener('hashchange', () => {
  const id = readInviteHash();
  if (!id) return;
  S.pendingJoin = id;
  if (!S.me) { if (S.screen === 'start') showStart(); return; }
  if (S.screen === 'room') { S.pendingJoin = null; clearInviteHash(); toast(t('join.alreadyIn'), 'error'); return; }
  if (S.screen === 'browser') goAfterLogin();
});

// ---- language ----
// Redraw whatever is on screen in the new language.
function changeLanguage(code) {
  const typed = $('#username') ? $('#username').value : null;
  I18n.set(code, true);
  applyStaticText();
  renderChrome();
  const helpOpen = !!$('#lang-select-help');
  switch (S.screen) {
    case 'start': showStart('', typed); break;
    case 'browser': renderBrowser(); break;
    case 'create': renderCreate(); break;
    case 'room':
      S.ui.stageKey = null;
      renderRoomShell();
      renderChatAll();
      renderRoomAll();
      break;
    case 'replaced': showReplaced(); break;
    default: renderBootScreen();
  }
  if (helpOpen) { actions.help(); const sel = $('#lang-select-help'); if (sel) sel.focus(); }
}

function renderBootScreen() {
  $('#screen').innerHTML = `<div class="py-24 text-center text-muted"><i class="fa-solid fa-circle-notch spin" aria-hidden="true"></i> ${esc(t('conn.connecting'))}</div>`;
}

// ---- go ----
S.pendingJoin = readInviteHash();
I18n.init();
applyStaticText();
Theme.apply();
S.screen = 'boot';
renderChrome();
renderBootScreen();
setInterval(tick, 100);
socket.connect();
