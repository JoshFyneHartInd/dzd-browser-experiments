// Bootstrap: screens (gate, title, game, end), the fixed-step loop, autosave, visibility handling.
import { CONFIG, SYSTEM_BY_ID } from './config.js';
import { createSim, tick, DT } from './sim.js';
import { GameUI } from './ui.js';
import { Menu, DebugPanel } from './menu.js';
import { startWalkthrough } from './tutorial.js';
import { applyTheme, loadSavedThemeId, installThemeStyles } from './themes.js';
import * as save from './save.js';
import * as audio from './audio.js';
import { h, ph } from './dom.js';
import { fmtClock } from './util.js';
import { clockText } from './dom.js';
import { stateIcon } from './svg.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const AUTOSAVE_MS = 30000;
const UI_INTERVAL = 100;

const $ = (id) => document.getElementById(id);
const gate = $('size-gate'), titleEl = $('title-screen'), gameRoot = $('game-root'), endEl = $('end-screen');

const app = {
  sim: null, ui: null, menu: null, debug: null, difficulty: 'standard', speed: 1, showTrue: false, blocked: false, inGame: false,
  global: save.loadGlobal(),
  themeId: () => loadSavedThemeId(),
  audioSettings: () => audio.settings(),
  setAudio(patch) { audio.configure(patch); this.global = save.saveGlobal({ audio: audio.settings() }); this.refreshTitleSound(); },
  toggleMute() { this.setAudio({ muted: !audio.settings().muted }); audio.unlock(); if (!audio.settings().muted) audio.click(); },
  togglePause() {
    if (!this.sim || this.sim.over) return;
    this.sim.paused = !this.sim.paused;
    audio.click();
    if (this.sim.paused) save.saveRun(this.sim);
    this.ui.update(performance.now());
  },
  replayWalkthrough() { runWalkthrough(); },
  quit() { quitToTitle(); },
  refreshTitleSound() {},
};

/* ---------------------------------------------------------------- size gate */

function tooSmall() { return window.innerWidth < 1024 || window.innerHeight > window.innerWidth; }
function checkGate() {
  const small = tooSmall();
  gate.hidden = !small;
  document.body.classList.toggle('gated', small);
  app.blocked = small;
  return small;
}
window.addEventListener('resize', checkGate);
window.addEventListener('orientationchange', () => setTimeout(checkGate, 120));

/* -------------------------------------------------------------------- title */

function showTitle() {
  app.inGame = false;
  gameRoot.hidden = true; endEl.hidden = true; titleEl.hidden = false;
  const best = app.global.best = save.loadGlobal().best;
  const hasSave = save.hasRun();
  const s = audio.settings();
  titleEl.innerHTML = `
    <div class="title-card">
      <div class="title-top"><button class="btn icon-btn" data-k="menu" aria-label="Menu" aria-haspopup="true" aria-expanded="false" title="Menu (themes, sound)">${ph('gear-six')}</button></div>
      <div class="title-mark">${ph('waves')}</div>
      <h1>Deepwatch</h1>
      <p class="tagline">Tend a deep sea science station. Notice the drift, work out the cause, make small corrections, and let it settle.</p>
      <fieldset class="diff"><legend>Difficulty</legend>
        ${Object.entries(CONFIG.difficulty).map(([id, d]) => `
          <label class="diff-opt"><input type="radio" name="diff" value="${id}" ${id === app.difficulty ? 'checked' : ''}>
            <span class="diff-card"><b>${d.label}</b><small>${d.blurb}</small><small class="best">Best: ${best[id] ? best[id].toFixed(1) + ' days' : 'none yet'}</small></span></label>`).join('')}
      </fieldset>
      <div class="title-actions">
        <button class="btn primary big" data-k="start">${ph('play')} Start</button>
        <button class="btn big" data-k="continue" ${hasSave ? '' : 'hidden'}>${ph('arrow-clockwise')} Continue</button>
      </div>
      <p class="warn" data-k="warn" hidden>Starting a new run replaces your saved run. Press Start again to confirm.</p>
      <div class="title-foot">
        <button class="switch" data-k="sound" type="button" role="switch" aria-checked="${!s.muted}" aria-label="Sound"><span class="switch-knob"></span><span class="switch-text">Sound ${s.muted ? 'OFF' : 'ON'}</span></button>
        <button class="btn" data-k="how">${ph('question')} How to play</button>
      </div>
    </div>`;
  const q = (k) => titleEl.querySelector(`[data-k="${k}"]`);
  let confirmNew = false;
  for (const r of titleEl.querySelectorAll('input[name="diff"]')) r.onchange = () => { app.difficulty = r.value; audio.unlock(); audio.tick(); };
  q('start').onclick = () => {
    audio.unlock();
    if (hasSave && !confirmNew) { confirmNew = true; q('warn').hidden = false; return; }
    startRun();
  };
  q('continue').onclick = () => { audio.unlock(); continueRun(); };
  q('how').onclick = () => { audio.unlock(); runWalkthrough(); };
  const sound = q('sound');
  app.refreshTitleSound = () => {
    const m = audio.settings().muted;
    sound.setAttribute('aria-checked', String(!m));
    sound.querySelector('.switch-text').textContent = `Sound ${m ? 'OFF' : 'ON'}`;
  };
  sound.onclick = () => { audio.unlock(); app.setAudio({ muted: !audio.settings().muted }); if (!audio.settings().muted) audio.click(); };
  const titleApp = Object.create(app); // shares state and methods with app; `this` inside them still reaches app's own fields
  titleApp.quit = () => {};
  const titleMenu = new Menu(titleEl.querySelector('.title-card'), titleApp);
  q('menu').onclick = () => { audio.unlock(); titleMenu.toggle(q('menu')); };
  // Title menu: no "Quit" on the title screen
  const origOpen = titleMenu.open.bind(titleMenu);
  titleMenu.open = (a) => { origOpen(a); const quit = titleMenu.panel && titleMenu.panel.querySelector('[data-k="quit"]'); if (quit) quit.remove(); };
  (hasSave ? q('continue') : q('start')).focus({ preventScroll: true });
}

/* --------------------------------------------------------------------- game */

function mountGame(sim) {
  app.sim = sim;
  app.inGame = true;
  app.showTrue = false;
  app.speed = 1;
  titleEl.hidden = true; endEl.hidden = true; gameRoot.hidden = false;
  audio.resetAlarms();
  app.ui = new GameUI(gameRoot, app);
  app.menu = new Menu(app.ui.menuHost, app);
  if (DEBUG) app.debug = new DebugPanel(gameRoot, app);
  app.ui.update(performance.now());
  lastTs = null; lastSave = performance.now(); uiAcc = 0; acc = 0;
}

function startRun() {
  const sim = createSim({ difficulty: app.difficulty });
  save.saveRun(sim);
  mountGame(sim);
}
function continueRun() {
  const sim = save.loadRun();
  if (!sim) { showTitle(); return; }
  app.difficulty = sim.diff;
  sim.paused = false;
  mountGame(sim);
}
function teardownGame() {
  if (app.debug) { app.debug.destroy(); app.debug = null; }
  if (app.ui) { app.ui.destroy(); app.ui = null; }
  app.menu = null;
}
function quitToTitle() {
  if (app.sim && !app.sim.over) save.saveRun(app.sim);
  teardownGame();
  app.sim = null;
  showTitle();
}

/* --------------------------------------------------------------- loop */

let lastTs = null, acc = 0, uiAcc = 0, lastSave = 0, raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const sim = app.sim;
  if (!app.inGame || !sim || !app.ui) return;
  if (document.hidden || app.blocked || app.walkthrough) { lastTs = null; return; }
  if (lastTs == null) lastTs = now;
  const dt = Math.min(0.5, (now - lastTs) / 1000);
  lastTs = now;
  if (!sim.paused && !sim.over) {
    acc += dt * app.speed;
    let guard = 0;
    while (acc >= DT && guard++ < 2000) { tick(sim, DT); acc -= DT; }
  }
  uiAcc += dt * 1000;
  if (uiAcc >= UI_INTERVAL) { uiAcc = 0; app.ui.update(now); }
  if (sim.over) { endRun(); return; }
  if (now - lastSave >= AUTOSAVE_MS) { lastSave = now; save.saveRun(sim); }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { lastTs = null; if (app.sim && !app.sim.over) save.saveRun(app.sim); }
  else lastTs = null; // clock resumes from now: no offline catch-up
});
window.addEventListener('pagehide', () => { if (app.sim && !app.sim.over) save.saveRun(app.sim); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.ui && !app.walkthrough) app.ui.handleEscape();
});
document.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });

/* ------------------------------------------------------------------ end */

function endRun() {
  const sim = app.sim, info = sim.endInfo;
  app.sim = null;
  save.deleteRun();
  audio.gameOver();
  const score = save.recordScore(sim.diff, info.days);
  teardownGame();
  app.inGame = false;
  gameRoot.hidden = true; titleEl.hidden = true; endEl.hidden = false;
  const chain = info.chain.map((l, i) => `<li class="${l.final ? 'final' : ''}">${i ? `<span class="arrow" aria-hidden="true">${ph('arrow-down')}</span>` : ''}
      <span class="chain-t">${clockText(l.t)}</span><span class="chain-x">${l.text}${!l.final && l.open ? ' <em>(never fixed)</em>' : ''}${l.chained ? ' <em>(knock-on effect)</em>' : ''}</span></li>`).join('');
  const stab = CONFIG.systems.map((s) => `<li><span class="stab-name">${ph(s.icon)} ${s.name}</span><span class="stab-bar" role="progressbar" aria-label="${s.name} time in band" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.stability[s.id]}"><i style="width:${info.stability[s.id]}%"></i></span><span class="stab-v">${info.stability[s.id]}%</span></li>`).join('');
  const log = info.lastLog.map((e) => `<li><time>${clockText(e.t)}</time> <span class="lt"></span></li>`).join('');
  endEl.innerHTML = `
    <div class="end-card">
      <div class="end-head">${stateIcon('critical', 48)}<div><h1>Station lost</h1><p>${info.name} stayed critical for too long.</p></div></div>
      <div class="end-score"><div><span class="big-num">${score.score.toFixed(1)}</span><span>days survived</span></div>
        <div><span class="big-num">${score.best.toFixed(1)}</span><span>best on ${CONFIG.difficulty[sim.diff].label}${score.isBest ? ' (new best!)' : ''}</span></div>
        <div><span class="big-num">${fmtClock(info.t)}</span><span>real time played</span></div></div>
      <div class="end-cols">
        <section><h2>How it happened</h2><ol class="chain">${chain}</ol></section>
        <section><h2>Last log entries</h2><ol class="endlog">${log}</ol></section>
        <section><h2>Stability (time in band)</h2><ul class="stab">${stab}</ul></section>
      </div>
      <div class="end-actions"><button class="btn primary big" data-k="again">${ph('arrow-clockwise')} Play again</button><button class="btn big" data-k="title">${ph('house')} Title screen</button></div>
    </div>`;
  endEl.querySelectorAll('.lt').forEach((el, i) => { el.textContent = info.lastLog[i].text; });
  endEl.querySelector('[data-k="again"]').onclick = () => { app.difficulty = sim.diff; startRun(); };
  endEl.querySelector('[data-k="title"]').onclick = () => showTitle();
  endEl.querySelector('[data-k="again"]').focus({ preventScroll: true });
}

/* -------------------------------------------------------------- walkthrough */

function runWalkthrough() {
  if (app.walkthrough) return;
  const wasPaused = app.sim ? app.sim.paused : false;
  if (app.sim) app.sim.paused = true;
  app.walkthrough = startWalkthrough({
    onDone() {
      app.walkthrough = null;
      app.global = save.saveGlobal({ tutorialSeen: true });
      if (app.sim) { app.sim.paused = wasPaused; lastTs = null; }
      if (!app.inGame) showTitle();
    },
  });
}

/* ------------------------------------------------------------------- start */

function boot() {
  installThemeStyles();
  applyTheme(loadSavedThemeId(), { persist: false });
  audio.configure(app.global.audio);
  document.documentElement.classList.add('theme-ready');
  checkGate();
  showTitle();
  raf = requestAnimationFrame(frame);
  watchIconFont();
  if (!app.global.tutorialSeen && !tooSmall()) runWalkthrough();
}

/** If the icon font CDN is unreachable, icon-only buttons fall back to their text labels. */
function watchIconFont() {
  const probe = h('i', { class: 'ph ph-gear-six', 'aria-hidden': 'true', style: 'position:absolute;left:-99px;top:-99px' });
  document.body.append(probe);
  const check = () => {
    const c = getComputedStyle(probe, '::before').content;
    document.documentElement.classList.toggle('no-icons', !c || c === 'none' || c === 'normal');
  };
  [1500, 4000, 10000].forEach((ms) => setTimeout(check, ms));
}
boot();

if (DEBUG) window.deepwatch = app;
