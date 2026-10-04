// Node simulation tests (no DOM): node tests/sim.test.js
import { createSim, run, tick, DT, setControl, controlPending, startJob, jobInfo, forceEvent, serializeSim, restoreSim, critCountdown } from '../js/sim.js';
import { CONFIG, STATES, SENSOR_SYSTEMS, hasWear } from '../js/config.js';
import { EVENT_DEFS } from '../js/events.js';

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} +/- ${tol}, got ${a}`);

/** A sim with the random scheduler switched off, so tests control what happens. */
function quiet(seed = 1, difficulty = 'standard') {
  const sim = createSim({ difficulty, seed });
  sim.nextEventAt = Infinity;
  sim.nextCrisisAt = Infinity;
  return sim;
}
const anyTrueCritical = (sim) => CONFIG.systems.some((s) => sim.st[s.id].t === 3);
const shownState = (sim, sys) => STATES[sim.st[sys].s];
const logText = (sim) => sim.log.map((l) => l.text).join('\n');

console.log('Lag response');
test('control moves smoothly toward its setpoint with a delay', () => {
  const sim = quiet();
  const key = 'power.throttle';
  setControl(sim, 'power', 'throttle', 70); // small 10% move
  run(sim, 3);
  const early = (sim.ctl[key].eff - 60) / 10;
  ok(early < 0.1, `moved ${early} of the step after 3 s, should still be lagging`);
  run(sim, 42);
  const mid = (sim.ctl[key].eff - 60) / 10;
  ok(mid > 0.8 && mid < 1.05, `after one lag period expected ~done, got ${mid}`);
  run(sim, 120);
  near(sim.ctl[key].eff, 70, 0.05, 'settled');
});
test('pending indicator is on during the lag and off once settled', () => {
  const sim = quiet();
  setControl(sim, 'air', 'scrubber', 70);
  run(sim, 2);
  ok(controlPending(sim, 'air', 'scrubber').pending, 'pending right after the move');
  run(sim, 200);
  ok(!controlPending(sim, 'air', 'scrubber').pending, 'not pending when settled');
});
test('plant value lags behind the control (CO2 follows scrubber slowly)', () => {
  const sim = quiet();
  run(sim, 30);
  setControl(sim, 'air', 'scrubber', 0);
  run(sim, 20);
  const early = sim.v.air.co2;
  run(sim, 400);
  const late = sim.v.air.co2;
  ok(early < 1300, `CO2 should not jump in 20 s, got ${early}`);
  ok(late > early + 600, `CO2 should keep rising for minutes, ${early} -> ${late}`);
});

console.log('Overcorrection swing');
test('a hard, fast push overshoots; a gentle move does not', () => {
  const peak = (to) => {
    const sim = quiet();
    setControl(sim, 'power', 'throttle', to);
    let max = -Infinity, min = Infinity;
    for (let i = 0; i < 4 * 400; i++) { tick(sim); max = Math.max(max, sim.ctl['power.throttle'].eff); min = Math.min(min, sim.ctl['power.throttle'].eff); }
    return { max, min };
  };
  const hard = peak(15); // a 45-point drop from 60, away from the end stops
  const gentle = peak(55);
  ok(hard.min < 11, `hard push should undershoot its target of 15, min=${hard.min}`);
  ok(gentle.min > 54.99, `gentle move should not overshoot, min=${gentle.min}`);
});
test('overcorrecting makes the trim swing both ways', () => {
  const sim = quiet();
  setControl(sim, 'ballast', 'tanks', 0);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 4 * 600; i++) { tick(sim); lo = Math.min(lo, sim.v.ballast.trim); hi = Math.max(hi, sim.v.ballast.trim); }
  ok(lo < -15, `trim should dive hard, min=${lo}`);
  setControl(sim, 'ballast', 'tanks', 100);
  let swung = -Infinity;
  for (let i = 0; i < 4 * 600; i++) { tick(sim); swung = Math.max(swung, sim.v.ballast.trim); }
  ok(swung > 15, `reversing hard should swing trim the other way, max=${swung}`);
});

console.log('Healthy station');
test('with no events, 40 minutes at the roughest drift stays out of Alert', () => {
  for (const seed of [1, 2, 3]) {
    const sim = quiet(seed, 'rough');
    let worst = 0, who = '';
    for (let i = 0; i < 4 * 2400; i++) {
      tick(sim);
      for (const s of CONFIG.systems) if (!['fuel', 'consumables', 'water'].includes(s.id) && sim.st[s.id].s > worst) { worst = sim.st[s.id].s; who = `${s.id}@${Math.round(sim.t)}s ` + JSON.stringify(sim.shown[s.id]); }
    }
    ok(worst <= 1, `seed ${seed}: reached ${STATES[worst]} on ${who}`);
  }
});
test('the log is quiet while healthy', () => {
  const sim = quiet(5, 'standard');
  run(sim, 600);
  ok(sim.log.filter((l) => l.kind === 'state' && l.sev >= 2).length === 0, 'no alert-level state lines');
});

console.log('Sensor error behavior');
test('a phantom reading looks like an alert while the true value is fine', () => {
  const sim = quiet(7);
  run(sim, 20);
  forceEvent(sim, 'sensor', { sys: 'air', mode: 'phantom' });
  run(sim, 15);
  ok(sim.st.air.t === 0, 'true Air state is healthy');
  ok(sim.st.air.s >= 2, `displayed Air state should be Alert or worse, got ${shownState(sim, 'air')}`);
  ok(sim.st.instruments.t >= 1, 'Instruments reveals a problem (second gauge)');
  ok(sim.sensors.air.health < 60, 'Air sensor health is visibly low');
});
test('recalibrating the right sensor clears a phantom reading', () => {
  const sim = quiet(7);
  forceEvent(sim, 'sensor', { sys: 'air', mode: 'phantom' });
  run(sim, 5);
  ok(startJob(sim, 'instruments.recal.air'), 'recalibrate starts');
  run(sim, CONFIG.sensors.recalDur + 20);
  ok(!sim.events.some((e) => e.def === 'sensor'), 'event resolved');
  run(sim, 30);
  ok(sim.st.air.s <= 1, `Air shown state recovered, got ${shownState(sim, 'air')}`);
});
test('recalibrating the wrong sensor does not fix it', () => {
  const sim = quiet(7);
  forceEvent(sim, 'sensor', { sys: 'air', mode: 'phantom' });
  startJob(sim, 'instruments.recal.hull');
  run(sim, 120);
  ok(sim.events.some((e) => e.def === 'sensor'), 'still faulty');
});
test('a stuck gauge freezes while the true value moves; swap fixes it', () => {
  const sim = quiet(9);
  run(sim, 10);
  forceEvent(sim, 'sensor', { sys: 'air', mode: 'stuck' });
  const frozen = sim.shown.air.co2;
  setControl(sim, 'air', 'scrubber', 0);
  run(sim, 400);
  ok(sim.shown.air.co2 === frozen, 'shown value did not move');
  ok(sim.v.air.co2 > frozen + 500, 'true CO2 climbed');
  ok(startJob(sim, 'instruments.swap.air'), 'swap starts');
  run(sim, CONFIG.sensors.swapDur + 10);
  ok(Math.abs(sim.shown.air.co2 - sim.v.air.co2) < 100, 'gauge tracks again');
});
test('a dropout shows no data and costs a spare to swap', () => {
  const sim = quiet(11);
  forceEvent(sim, 'sensor', { sys: 'hull', mode: 'dropout' });
  run(sim, 5);
  ok(sim.shown.hull.integrity === null, 'no reading');
  ok(sim.st.hull.noData, 'noData flag set');
  const spares = sim.v.consumables.spares;
  startJob(sim, 'instruments.swap.hull');
  ok(sim.v.consumables.spares === spares - 1, 'a spare was used');
  run(sim, 80);
  ok(sim.shown.hull.integrity !== null, 'reading is back');
});
test('sensor noise and bias grow as sensor health falls', () => {
  const sim = quiet(13);
  const spread = (health) => {
    const s = createSim({ seed: 13 }); s.nextEventAt = Infinity; s.nextCrisisAt = Infinity;
    s.sensors.water.health = health;
    let sum = 0, n = 0;
    for (let i = 0; i < 4 * 120; i++) { s.sensors.water.health = health; tick(s); sum += Math.abs(s.shown.water.sal - s.v.water.sal); n++; }
    return sum / n;
  };
  ok(spread(20) > spread(100) * 2, 'worse sensor, bigger error');
});

console.log('Event chaining');
test('an ignored leak escalates into a flooded bilge and a power drain', () => {
  const sim = quiet(3);
  const load0 = sim.v.power.load;
  forceEvent(sim, 'leak', { size: 'large' });
  run(sim, CONFIG.events.escalate.leak + 30);
  ok(sim.events.some((e) => e.def === 'bilge'), 'bilge event spawned');
  ok(/bilge pumps/i.test(logText(sim)), 'observable log line about the pumps');
  run(sim, CONFIG.events.escalate.bilge + 60);
  ok(/output sagging/i.test(logText(sim)), 'power drain appears in the log');
  ok(sim.mods.eff.gen < 1, 'generator output degraded');
});
test('an ignored equipment fault spreads to a linked system', () => {
  const sim = quiet(4);
  forceEvent(sim, 'equip', { sys: 'power' });
  run(sim, CONFIG.events.escalate.equip + 20);
  ok(sim.events.some((e) => e.def === 'equip' && e.system === 'air'), 'spread to Air');
});
test('maintenance clears an equipment fault', () => {
  const sim = quiet(4);
  forceEvent(sim, 'equip', { sys: 'water' });
  ok(startJob(sim, 'water.maint'), 'maintenance starts');
  run(sim, 100);
  ok(!sim.events.some((e) => e.def === 'equip'), 'fault cleared');
});
test('a storm that overstresses the hull opens a leak', () => {
  const sim = quiet(5);
  forceEvent(sim, 'storm');
  run(sim, 100);
  sim.v.hull.stress = 80; // player ignored it
  sim.wear.hull = 60;
  run(sim, CONFIG.events.escalate.storm);
  ok(sim.events.some((e) => e.def === 'leak') || /intensifying/i.test(logText(sim)), 'storm escalated');
});
test('a supply delay with low filters degrades the scrubber', () => {
  const sim = quiet(6);
  sim.v.consumables.filters = 2;
  forceEvent(sim, 'supply');
  run(sim, CONFIG.events.escalate.supply + 20);
  ok(sim.events.some((e) => e.def === 'equip' && e.system === 'air'), 'scrubber bed degraded');
});
test('a resupply order delivers after a delay and a supply event lengthens it', () => {
  const sim = quiet(8);
  forceEvent(sim, 'supply');
  const food = sim.v.consumables.food;
  run(sim, 2);
  startJob(sim, 'consumables.orderFood');
  const dur = sim.jobs['consumables.orderFood'].end - sim.jobs['consumables.orderFood'].start;
  ok(dur >= CONFIG.model.cons.orderDur + CONFIG.events.supplyExtra - 1, `delay includes the event (${dur})`);
  run(sim, dur + 5);
  ok(sim.v.consumables.food > food + 20, 'food delivered');
});
test('each item can be ordered on its own and delivers only that item', () => {
  const make = () => { const sim = quiet(3); sim.v.consumables.food = 40; sim.v.consumables.filters = 6; sim.v.consumables.spares = 4; sim.v.fuel.level = 40; return sim; };
  const read = (s) => ({ Food: s.v.consumables.food, Filters: s.v.consumables.filters, Spares: s.v.consumables.spares, Fuel: s.v.fuel.level });
  const base = make(); run(base, CONFIG.model.cons.orderDur + 5); // same time passing, nothing ordered
  for (const item of ['Food', 'Filters', 'Spares', 'Fuel']) {
    const sim = make();
    ok(startJob(sim, `consumables.order${item}`), `order ${item} starts`);
    run(sim, CONFIG.model.cons.orderDur + 5);
    const got = read(sim), ref = read(base);
    const extra = Object.keys(got).filter((k) => got[k] - ref[k] > 0.5);
    ok(extra.length === 1 && extra[0] === item, `ordering ${item} should add only ${item}, but added: ${extra.join(', ') || 'nothing'}`);
  }
});
test('only one delivery can be on its way at a time', () => {
  const sim = quiet(4);
  sim.v.consumables.food = 40; sim.v.fuel.level = 40;
  ok(startJob(sim, 'consumables.orderFood'), 'first order starts');
  ok(!startJob(sim, 'consumables.orderFuel'), 'a second order is refused while the first is active');
  ok(jobInfo(sim, 'consumables.orderFuel').reason === 'Another delivery is on its way', jobInfo(sim, 'consumables.orderFuel').reason);
  run(sim, CONFIG.model.cons.orderDur + 2);
  ok(startJob(sim, 'consumables.orderFuel'), 'a different item can be ordered right after the first arrives');
});
test('the cooldown is short and only blocks re-ordering the same item', () => {
  ok(CONFIG.model.cons.orderCd <= 90, `cooldown should be short, is ${CONFIG.model.cons.orderCd}s`);
  const sim = quiet(4);
  sim.v.consumables.food = 20; sim.v.fuel.level = 20;
  startJob(sim, 'consumables.orderFood');
  run(sim, CONFIG.model.cons.orderDur + 2);
  ok(jobInfo(sim, 'consumables.orderFood').reason === 'Cooling down', 'same item cools down');
  ok(jobInfo(sim, 'consumables.orderFuel').canStart, 'other items are ready straight away');
  run(sim, CONFIG.model.cons.orderCd + 2);
  ok(jobInfo(sim, 'consumables.orderFood').canStart, 'same item is available again after the cooldown');
});
test('ordering an item that is already full is refused', () => {
  const sim = quiet(4);
  sim.v.fuel.level = 100;
  ok(!startJob(sim, 'consumables.orderFuel') && jobInfo(sim, 'consumables.orderFuel').reason === 'Stock full', 'full tank');
});
test('a supply-tender delay extends whichever order is on its way', () => {
  const sim = quiet(6);
  sim.v.consumables.filters = 6;
  startJob(sim, 'consumables.orderFilters');
  const end = sim.jobs['consumables.orderFilters'].end;
  forceEvent(sim, 'supply');
  ok(sim.jobs['consumables.orderFilters'].end >= end + CONFIG.events.supplyExtra - 1, 'ETA extended');
});
test('a save from before per-item orders still loads, with the new order jobs ready', () => {
  const a = quiet(2);
  const s = JSON.parse(JSON.stringify(serializeSim(a)));
  for (const k of Object.keys(s.jobs)) if (k.startsWith('consumables.order')) delete s.jobs[k];
  s.jobs['consumables.order'] = { active: false, start: 0, end: 0, cdUntil: 0 };
  const b = restoreSim(s);
  ok(b && !b.jobs['consumables.order'], 'old order job dropped');
  ok(jobInfo(b, 'consumables.orderFood').canStart, 'new order jobs exist and are ready');
  run(b, 5);
});

console.log('Lose condition');
test('staying Critical past the grace period ends the run with a cause chain', () => {
  const sim = quiet(2);
  forceEvent(sim, 'leak', { size: 'large' });
  sim.v.hull.integrity = 20; // critical (< 30)
  sim.v.hull.leak = 3;
  let started = null;
  for (let i = 0; i < 4 * 400 && !sim.over; i++) {
    tick(sim);
    if (started === null && sim.crit.hull > 0) started = sim.t;
    sim.v.hull.integrity = Math.min(sim.v.hull.integrity, 25);
  }
  ok(sim.over, 'game over reached');
  near(sim.t - started, CONFIG.lose.grace, 3, 'grace period');
  ok(sim.endInfo && sim.endInfo.sys === 'hull', 'endInfo names Hull');
  ok(sim.endInfo.chain.length >= 2, 'cause chain has entries');
  ok(Object.keys(sim.endInfo.stability).length === CONFIG.systems.length, 'stability summary covers every system');
});
test('a visible countdown runs while Critical and recovery resets it', () => {
  const sim = quiet(2);
  sim.v.hull.integrity = 20;
  run(sim, 10);
  const c = critCountdown(sim);
  ok(c && c.sys === 'hull' && c.left < CONFIG.lose.grace && c.left > CONFIG.lose.grace - 15, 'countdown is running');
  sim.v.hull.integrity = 80;
  run(sim, 120);
  ok(sim.crit.hull === 0 && !sim.over, 'timer drained after recovery');
});
test('a masked gauge cannot hide the hardwired countdown', () => {
  const sim = quiet(2);
  forceEvent(sim, 'sensor', { sys: 'hull', mode: 'stuck' });
  sim.v.hull.integrity = 20;
  run(sim, 10);
  ok(sim.st.hull.s === 0, 'hull tile still looks fine');
  ok(critCountdown(sim), 'countdown banner still appears');
});

console.log('Crises and warnings');
test('every crisis warns at least 20 s before its critical effect', () => {
  ok(CONFIG.events.crisisWarn >= 20, 'configured warning window');
  for (const def of ['crisis_breach', 'crisis_trip']) {
    const sim = quiet(10);
    run(sim, 10);
    const ev = forceEvent(sim, def);
    const t0 = sim.t;
    ok(/CRISIS WARNING/.test(logText(sim)), `${def}: warning logged immediately`);
    let firstCritical = null;
    for (let i = 0; i < 4 * 200 && firstCritical === null; i++) { tick(sim); if (anyTrueCritical(sim)) firstCritical = sim.t - t0; }
    ok(firstCritical === null || firstCritical >= 20, `${def}: first Critical came after ${firstCritical} s`);
  }
});
test('lowering the throttle in the warning window averts the generator trip', () => {
  const sim = quiet(12);
  forceEvent(sim, 'crisis_trip');
  setControl(sim, 'power', 'throttle', 35);
  run(sim, CONFIG.events.crisisWarn + 5);
  ok(!sim.events.some((e) => e.def === 'crisis_trip'), 'crisis resolved');
  ok(sim.mods.eff.gen === 1, 'generator still online');
  const sim2 = quiet(12);
  forceEvent(sim2, 'crisis_trip');
  run(sim2, CONFIG.events.crisisWarn + 40);
  ok(sim2.v.power.output < 20, `ignoring it trips the generator, output=${sim2.v.power.output}`);
});
test('a patch crew can end a hull breach', () => {
  const sim = quiet(14);
  forceEvent(sim, 'crisis_breach');
  run(sim, CONFIG.events.crisisWarn + 5);
  ok(startJob(sim, 'hull.patch'), 'dispatch');
  run(sim, 120);
  ok(!sim.events.some((e) => e.def === 'crisis_breach'), 'breach resolved');
  ok(!sim.over, 'station survived');
});
test('crisis cadence follows difficulty', () => {
  const m = (d) => CONFIG.difficulty[d].crisisMean;
  ok(m('quiet') > m('standard') && m('standard') > m('rough'), 'rarer on Quiet, more common on Rough');
  near(m('rough'), 3600, 1, 'about once per game day at Rough');
});

console.log('No sub-60-second problems (non-crisis)');
test('no non-crisis event reaches true Critical within 60 s, on any difficulty', () => {
  const cases = [
    ['leak', { size: 'small' }], ['leak', { size: 'large' }], ['storm', {}], ['supply', {}],
    ...CONFIG.equipVariants.map((v) => ['equip', { sys: v.sys, key: v.key }]),
    ...SENSOR_SYSTEMS.flatMap((s) => ['stuck', 'dropout', 'phantom'].map((m) => ['sensor', { sys: s, mode: m }])),
  ];
  for (const diff of ['quiet', 'standard', 'rough']) {
    for (const [def, p] of cases) {
      const sim = quiet(21, diff);
      run(sim, 20);
      const t0 = sim.t;
      forceEvent(sim, def, p);
      let first = null;
      for (let i = 0; i < 4 * 60 && first === null; i++) { tick(sim); if (anyTrueCritical(sim)) first = sim.t - t0; }
      ok(first === null, `${diff}/${def}${p.sys ? ':' + p.sys : ''}${p.mode ? ':' + p.mode : ''} hit Critical after ${first} s`);
    }
  }
});
test('drifting alone never needs action in under 60 s: Caution comes well before Critical', () => {
  // slowest-possible walk from Healthy to Critical on the fastest-moving channels, unattended
  const sim = quiet(31);
  setControl(sim, 'air', 'scrubber', 0);
  let tCaution = null, tCritical = null;
  for (let i = 0; i < 4 * 3000 && tCritical === null; i++) {
    tick(sim);
    if (tCaution === null && sim.st.air.t >= 1) tCaution = sim.t;
    if (sim.st.air.t === 3) tCritical = sim.t;
  }
  ok(tCaution !== null, 'reaches Caution');
  ok(tCritical === null || tCritical - tCaution > 60, 'at least a minute between Caution and Critical');
});
test('the first event never arrives in the first 150 s, and never two at once early', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = createSim({ difficulty: 'rough', seed });
    sim.nextCrisisAt = Infinity;
    let maxOpen = 0;
    for (let i = 0; i < 4 * CONFIG.events.earlyWindow; i++) {
      tick(sim);
      if (sim.t < CONFIG.events.firstMin) ok(sim.events.length === 0, `seed ${seed}: event at ${sim.t}`);
      maxOpen = Math.max(maxOpen, sim.events.filter((e) => !e.parent).length);
    }
    ok(maxOpen <= 1, `seed ${seed}: ${maxOpen} root events at once in the early window`);
  }
});

console.log('Events can be diagnosed');
test('every event shows up on at least two readouts', () => {
  // leak: Hull leak + Air pressure
  let sim = quiet(41); forceEvent(sim, 'leak', { size: 'large' }); run(sim, 200);
  ok(sim.shown.hull.leak > 1.5 && sim.shown.air.pr < 99 && sim.shown.hull.bilge > 0, 'leak: hull leak, air pressure, bilge');
  // storm: comms + hull stress
  sim = quiet(42); forceEvent(sim, 'storm'); run(sim, 80);
  ok(sim.v.comms.sig < 55 && sim.v.hull.stress > 40, 'storm: comms signal and hull stress');
  // equipment: system value + its own output readout vs setpoint
  sim = quiet(43); forceEvent(sim, 'equip', { sys: 'air', key: 'scrub' }); run(sim, 300);
  ok(sim.v.air.scrubOut < 35 && sim.v.air.co2 > 1100, 'equip: scrubber output below its setting and CO2 rising');
  // supply: log + consumables ETA
  sim = quiet(44); forceEvent(sim, 'supply'); ok(/tender delayed/i.test(logText(sim)), 'supply: logged');
});
test('at least one event type needs a second gauge, and one involves a faulty gauge', () => {
  ok(EVENT_DEFS.sensor, 'sensor faults exist');
  const sim = quiet(7); forceEvent(sim, 'sensor', { sys: 'power', mode: 'phantom' }); run(sim, 15);
  ok(sim.st.power.t === 0 && sim.st.power.s >= 2, 'looks bad on the tile, is fine in truth');
  ok(sim.sensors.power.health < 60, 'Instruments is the second gauge that explains it');
});

console.log('Wear');
test('systems you cannot service never wear, while serviceable ones still do', () => {
  const sim = quiet(7);
  for (const id of ['consumables', 'fuel']) ok(sim.wear[id] === 0, `${id} starts with no wear (${sim.wear[id]})`);
  forceEvent(sim, 'leak', { size: 'large' }); // push some systems out of band so wear would accumulate
  run(sim, 1500);
  for (const id of ['consumables', 'fuel']) ok(sim.wear[id] === 0, `${id} still has no wear after a long run (${sim.wear[id]})`);
  ok(sim.wear.power > 3 && sim.wear.hull > 3, `power and hull do wear (${sim.wear.power.toFixed(1)}, ${sim.wear.hull.toFixed(1)})`);
  for (const sd of CONFIG.systems) ok(hasWear(sd) === sd.controls.some((c) => c.id === 'maint'), `${sd.id}: wear matches having Maintenance`);
});
test('an older save that wore out Supplies and Fuel is cleaned up when loaded', () => {
  const a = quiet(2);
  const s = JSON.parse(JSON.stringify(serializeSim(a)));
  s.wear.fuel = 40; s.wear.consumables = 25;
  const b = restoreSim(s);
  ok(b.wear.fuel === 0 && b.wear.consumables === 0, 'wear cleared');
  run(b, 60);
  ok(b.wear.fuel === 0 && b.wear.consumables === 0, 'and stays cleared');
});

console.log('Persistence and determinism');
test('a save round-trips through JSON and resumes identically', () => {
  const a = createSim({ seed: 99 });
  run(a, 700);
  const b = restoreSim(JSON.parse(JSON.stringify(serializeSim(a))));
  ok(b, 'restored');
  run(a, 300); run(b, 300);
  ok(JSON.stringify(a.v) === JSON.stringify(b.v), 'same state after resuming');
  ok(a.log.length === b.log.length, 'same log');
});
test('pending progress is kept in the sim, so it survives a save and reload', () => {
  const a = quiet(5);
  setControl(a, 'hull', 'pump', 100); // 20 -> 100
  run(a, 4);
  const p1 = controlPending(a, 'hull', 'pump');
  ok(p1.pending && p1.progress > 0.05 && p1.progress < 0.95, `mid-move progress should be partway, got ${p1.progress}`);
  const b = restoreSim(JSON.parse(JSON.stringify(serializeSim(a))));
  near(controlPending(b, 'hull', 'pump').progress, p1.progress, 1e-9, 'progress after reload');
  run(b, 2);
  ok(controlPending(b, 'hull', 'pump').progress > p1.progress, 'progress keeps rising after reload');
});
test('a save from before progress was tracked still loads and shows a sane progress', () => {
  const a = quiet(5);
  setControl(a, 'hull', 'pump', 100); run(a, 10);
  const s = JSON.parse(JSON.stringify(serializeSim(a)));
  for (const k in s.ctl) delete s.ctl[k].from;
  const p = controlPending(restoreSim(s), 'hull', 'pump');
  ok(p.progress >= 0 && p.progress <= 1, `progress ${p.progress}`);
});
test('an incompatible save version is discarded', () => {
  const a = createSim({ seed: 1 });
  const s = serializeSim(a); s.version = 999;
  ok(restoreSim(s) === null, 'discarded');
});
test('a paused sim does not advance', () => {
  const sim = createSim({ seed: 1 });
  sim.paused = true;
  const t = sim.t;
  run(sim, 30);
  ok(sim.t === t, 'time frozen');
  ok(!setControl(sim, 'air', 'scrubber', 10), 'controls disabled');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
