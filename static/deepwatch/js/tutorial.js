// Walkthrough: runs on a separate, scripted demo station (no events, nothing can break). Skippable at any step.
import { createSim, run, tick, setControl, DT } from './sim.js';
import { GameUI } from './ui.js';
import { h, ph } from './dom.js';
import { stateIcon } from './svg.js';

function makeDemoSim() {
  const sim = createSim({ difficulty: 'quiet', seed: 7 });
  sim.nextEventAt = Infinity;
  sim.nextCrisisAt = Infinity;
  run(sim, 240);
  // Let Air drift: a low scrubber setting makes CO2 creep up into Caution.
  const c = sim.ctl['air.scrubber'];
  c.set = 22; c.eff = 22; c.vel = 0;
  run(sim, 900);
  sim.log.length = 0;
  sim.log.push({ t: sim.t - 70, sys: 'station', kind: 'info', sev: 0, text: 'Station watch begins. All systems nominal.' });
  sim.log.push({ t: sim.t - 20, sys: 'air', kind: 'state', sev: 1, text: 'Air: Caution (CO2 1,260 ppm).' });
  return sim;
}

const LEGEND = [
  ['healthy', 'OK', 'Inside the target band. Nothing to do.'],
  ['caution', 'Caution', 'Drifting. Take a look when you can.'],
  ['alert', 'Alert', 'Out of band. Act soon.'],
  ['critical', 'Critical', 'Dangerous. If it stays critical too long, the station is lost.'],
];

export function startWalkthrough({ onDone }) {
  const demo = makeDemoSim();
  const app = {
    sim: demo, demo: true, showTrue: false, menu: null,
    togglePause() {}, toggleMute() {}, replayWalkthrough() {}, quit() {},
    audioSettings: () => ({ muted: true, volume: 0 }),
  };
  const root = h('div', { class: 'tutorial-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Walkthrough' });
  const stage = h('div', { class: 'demo-stage' });
  const dims = ['top', 'left', 'right', 'bottom'].map((k) => h('div', { class: `dim dim-${k}` }));
  const ring = h('div', { class: 'spot-ring' });
  const card = h('div', { class: 'tut-card' });
  root.append(stage, ...dims, ring, card);
  document.body.append(root);
  const ui = new GameUI(stage, app);

  let speed = 1, step = 0, raf = 0, last = performance.now(), acc = 0, uiAcc = 0, done = false;
  const q = (sel) => stage.querySelector(sel);

  const steps = [
    {
      title: 'Reading a tile', target: () => q('.tile[data-sys="power"]'),
      text: 'Each tile is one station system. The ring and big number are its main reading. The smaller line is a second reading, and the line along the bottom is the last 10 minutes.',
    },
    {
      title: 'What the icons mean', target: () => q('.tile[data-sys="power"] .tile-badge'),
      html: `<ul class="legend">${LEGEND.map(([s, n, d]) => `<li>${stateIcon(s, 26)}<span><b>${n}.</b> ${d}</span></li>`).join('')}</ul><p>Colour helps, but the icon shape always tells you the state.</p>`,
    },
    {
      title: 'Spot the drift', target: () => q('.tile[data-sys="air"]'),
      text: 'Air has slipped into Caution and its trend line is climbing. Nothing is urgent, but this is the moment to look closer. Click the Air tile, or press Next.',
      waitFor: () => ui.detailSys === 'air',
    },
    {
      title: 'The detail screen', before: () => { if (ui.detailSys !== 'air') ui.openDetail('air'); }, target: () => q('.readouts'),
      text: 'Every reading for the system is here, with longer trend charts. CO2 is climbing because the scrubber is set low. Linked systems and controls are on the right.',
    },
    {
      title: 'Move a fader', target: () => q('.ctl[data-ctl="scrubber"]'),
      text: 'Drag the CO2 scrubber rate up to about 80. Nothing happens instantly: every control responds with a delay. Time runs faster in this demo so you can see it.',
      waitFor: () => demo.ctl['air.scrubber'].set >= 70, onEnter: () => { speed = 1; },
    },
    {
      title: 'The pending indicator', target: () => q('.ctl[data-ctl="scrubber"]'), onEnter: () => { speed = 8; },
      text: 'While a control is still moving, a pending bar shows it. Wait for Actual to catch up before judging the result. Pushing a fader hard and fast overshoots, then swings back, so make small moves and be patient.',
    },
    {
      title: 'Check a second gauge', target: () => q('.links'), onEnter: () => { speed = 8; },
      text: 'Before you trust one reading, check another. Linked systems are listed here. If two readings disagree, a gauge may be faulty: the Instruments system shows the health of every sensor.',
    },
    {
      title: 'The event log', before: () => ui.setLogOpen(true), target: () => q('.logpanel'),
      text: 'The log lists what the station reports: alarms and state changes. It never reveals hidden causes, so use it with your gauges to work out what happened. That is the loop: notice, diagnose, act, and let it settle.',
      last: true,
    },
  ];

  function place() {
    const s = steps[step];
    const el = s.target && s.target();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6, x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(vw - x, r.width + pad * 2), hh = Math.min(vh - y, r.height + pad * 2);
    const set = (d, l, t, ww, hhh) => Object.assign(d.style, { left: l + 'px', top: t + 'px', width: Math.max(0, ww) + 'px', height: Math.max(0, hhh) + 'px' });
    set(dims[0], 0, 0, vw, y); set(dims[3], 0, y + hh, vw, vh - y - hh);
    set(dims[1], 0, y, x, hh); set(dims[2], x + w, y, vw - x - w, hh);
    set(ring, x, y, w, hh);
    const cw = card.offsetWidth || 420, ch = card.offsetHeight || 220, gap = 14;
    let cx, cy;
    if (y + hh + gap + ch < vh) { cy = y + hh + gap; cx = Math.min(Math.max(12, x), vw - cw - 12); }
    else if (y - gap - ch > 0) { cy = y - gap - ch; cx = Math.min(Math.max(12, x), vw - cw - 12); }
    else if (x + w + gap + cw < vw) { cx = x + w + gap; cy = Math.min(Math.max(12, y), vh - ch - 12); }
    else { cx = Math.max(12, x - gap - cw); cy = Math.min(Math.max(12, y), vh - ch - 12); }
    card.style.left = cx + 'px'; card.style.top = cy + 'px';
  }

  function render() {
    const s = steps[step];
    if (s.before) s.before();
    if (s.onEnter) s.onEnter();
    card.innerHTML = `<div class="tut-count">Step ${step + 1} of ${steps.length}</div><h2>${s.title}</h2>${s.html || `<p>${s.text}</p>`}
      <div class="tut-actions"><button class="btn" data-k="skip">Skip walkthrough</button><span class="grow"></span>
      ${step > 0 ? `<button class="btn" data-k="back">${ph('arrow-left')} Back</button>` : ''}
      <button class="btn primary" data-k="next">${s.last ? 'Finish' : 'Next'} ${s.last ? ph('check') : ph('arrow-right')}</button></div>`;
    card.querySelector('[data-k="skip"]').onclick = () => finish(false);
    const back = card.querySelector('[data-k="back"]');
    if (back) back.onclick = () => go(step - 1);
    card.querySelector('[data-k="next"]').onclick = () => (s.last ? finish(true) : go(step + 1));
    card.querySelector('[data-k="next"]').focus({ preventScroll: true });
    requestAnimationFrame(place);
  }

  function go(n) {
    // Re-enter earlier steps in a sane UI state
    const target = steps[n];
    if (n < 3 && ui.detailSys) ui.closeDetail();
    if (n < 7 && ui.logOpen) ui.setLogOpen(false);
    if (n >= 3 && !ui.detailSys) ui.openDetail('air');
    step = n;
    render();
    void target;
  }

  function frame(now) {
    if (done) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt * speed;
    while (acc >= DT) { tick(demo, DT); acc -= DT; }
    uiAcc += dt;
    if (uiAcc > 0.1) { uiAcc = 0; ui.update(now); }
    const s = steps[step];
    if (s.waitFor && s.waitFor() && !s.satisfied) { s.satisfied = true; card.querySelector('[data-k="next"]').classList.add('pulse-ok'); if (step === 2) setTimeout(() => step === 2 && go(3), 350); }
    place();
    raf = requestAnimationFrame(frame);
  }

  function finish(completed) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    ui.destroy();
    root.remove();
    onDone(completed);
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }
  document.addEventListener('keydown', onKey, true);

  ui.update(performance.now());
  render();
  raf = requestAnimationFrame(frame);
  return { destroy: () => finish(false) };
}
