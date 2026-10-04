// Deepwatch simulation core. No DOM, no timers: call tick(sim, dt) with a fixed dt.
import { CONFIG, STATES, STATE_META, SYSTEM_BY_ID, SENSOR_SYSTEMS, channelOf, hasWear } from './config.js';
import { clamp, lerp, relax, rand, randRange, gauss, ouStep } from './util.js';
import { pushLog, applyEvents, updateEvents, scheduleInitial, forceEvent as forceEventRaw, onPatch, crisisState, activeNotices } from './events.js';

export const DT = 1 / CONFIG.time.tickHz;
export { pushLog, crisisState, activeNotices };

const freshMods = () => ({
  leak: 0, storm: 0, stressAdd: 0, extraLoad: 0, supplyDelay: 0,
  eff: { gen: 1, scrub: 1, o2: 1, pump: 1, ballast: 1, desal: 1, antenna: 1, processor: 1 },
});

const ctlSpecs = {};
for (const s of CONFIG.systems) for (const c of s.controls) ctlSpecs[`${s.id}.${c.id}`] = c;

export function stateIndex(ch, val) {
  const b = ch.bands;
  if (!b) return 0;
  const inR = (r) => val >= r[0] && val <= r[1];
  return inR(b.ok) ? 0 : inR(b.caution) ? 1 : inR(b.alert) ? 2 : 3;
}

export function formatValue(ch, val) {
  if (val == null) return '--';
  if (ch.text) return ch.text[clamp(Math.round(val), 0, ch.text.length - 1)];
  let s = val.toFixed(ch.dec);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); // no negative zero
  return ch.dec === 0 && Math.abs(val) >= 1000 ? Number(s).toLocaleString('en-US') : s;
}

export function createSim({ difficulty = 'standard', seed = (Date.now() >>> 0) } = {}) {
  const sim = {
    version: CONFIG.saveVersion, diff: difficulty, rng: seed | 0, t: 0, over: false, paused: false, endInfo: null, uid: 0,
    v: {}, shown: {}, st: {}, wear: {}, ctl: {}, jobs: {}, sensors: {}, ou: {}, events: [], history: [], log: [],
    lastMaint: {}, lastDelivery: -1, buoyAt: -1e9, timeIn: {}, crit: { hull: 0, air: 0, power: 0 }, critLogged: {},
    trend: {}, trendClock: 0, pf: 1,
  };
  sim.dm = CONFIG.difficulty[difficulty];
  sim.mods = freshMods();
  for (const s of CONFIG.systems) {
    sim.v[s.id] = {}; sim.shown[s.id] = {}; sim.trend[s.id] = {};
    for (const ch of s.channels) { sim.v[s.id][ch.id] = ch.init; sim.shown[s.id][ch.id] = ch.init; sim.trend[s.id][ch.id] = []; }
    const startWear = 3 + rand(sim) * 5; // always drawn, so seeded runs stay identical
    sim.wear[s.id] = hasWear(s) ? startWear : 0;
    sim.lastMaint[s.id] = -1;
    sim.timeIn[s.id] = { total: 0, healthy: 0 };
    sim.st[s.id] = { t: 0, s: 0, chT: {}, noData: false, hold: 0, noDataLogged: false };
    for (const c of s.controls) {
      const key = `${s.id}.${c.id}`;
      if (c.type === 'job') sim.jobs[key] = { active: false, start: 0, end: 0, cdUntil: 0 };
      else sim.ctl[key] = { set: c.def, eff: c.def, vel: 0, zeta: 1, from: c.def };
    }
  }
  for (const id of SENSOR_SYSTEMS) {
    sim.sensors[id] = { health: 100, bias: 0, offsets: {}, n: {}, noiseMul: 1, stuck: false, stuckVal: {}, dropout: false };
    for (const k of ['recal', 'swap']) sim.jobs[`instruments.${k}.${id}`] = { active: false, start: 0, end: 0, cdUntil: 0 };
  }
  scheduleInitial(sim);
  stepSensors(sim, DT);
  evaluateStates(sim, 0, true);
  pushLog(sim, 'station', 'info', 0, 'Station watch begins. All systems nominal.');
  return sim;
}

/* ---------------------------------------------------------------- controls */

export function setControl(sim, sysId, ctlId, value, { log = false } = {}) {
  if (sim.over || sim.paused) return false;
  const key = `${sysId}.${ctlId}`;
  const spec = ctlSpecs[key];
  const c = sim.ctl[key];
  if (!spec || !c) return false;
  if (spec.type === 'toggle') {
    c.set = value ? 1 : 0;
    if (log) pushLog(sim, sysId, 'player', 0, `You: ${spec.label} ${c.set ? 'on' : 'off'}.`);
    return true;
  }
  let val = clamp(Math.round(value / spec.step) * spec.step, spec.min, spec.max);
  const frac = Math.abs(val - c.eff) / (spec.max - spec.min);
  c.zeta = lerp(1, 0.35, clamp((frac - 0.1) / 0.3, 0, 1)); // small moves glide, big moves overshoot
  c.from = c.eff; // where this move started: the pending bar and overshoot marker measure from here (kept in the sim so leaving the screen cannot lose it)
  c.set = val;
  if (log) pushLog(sim, sysId, 'player', 0, `You: ${spec.label} set to ${val}${spec.unit || ''}.`);
  return true;
}

export function controlPending(sim, sysId, ctlId) {
  const spec = ctlSpecs[`${sysId}.${ctlId}`];
  const c = sim.ctl[`${sysId}.${ctlId}`];
  if (!c) return { pending: false, progress: 1 };
  const range = spec.type === 'toggle' ? 1 : spec.max - spec.min;
  const err = Math.abs(c.set - c.eff);
  const from = c.from ?? c.eff; // older saves have no start point: treat the move as starting now
  const total = Math.max(Math.abs(c.set - from), err, 1e-6);
  return { pending: err > Math.max(0.004 * range, 0.2 * (spec.step || 0.05)) || Math.abs(c.vel) > 0.03, err: err / range, from, progress: Math.max(0, Math.min(1, 1 - err / total)) };
}

function stepControls(sim, dt) {
  for (const key in sim.ctl) {
    const spec = ctlSpecs[key], c = sim.ctl[key];
    if (spec.type === 'toggle') { c.eff = relax(c.eff, c.set, spec.lag / 4, dt); if (Math.abs(c.eff - c.set) < 0.01) c.eff = c.set; continue; }
    const wn = 4 / spec.lag;
    const acc = wn * wn * (c.set - c.eff) - 2 * c.zeta * wn * c.vel;
    c.vel += acc * dt;
    c.eff += c.vel * dt;
    if (c.eff < spec.min) { c.eff = spec.min; c.vel = Math.max(0, c.vel); }
    if (c.eff > spec.max) { c.eff = spec.max; c.vel = Math.min(0, c.vel); }
    if (Math.abs(c.set - c.eff) < 0.02 * spec.step && Math.abs(c.vel) < 0.01) { c.eff = c.set; c.vel = 0; }
  }
}

/* -------------------------------------------------------------------- jobs */

function jobSpec(key) {
  const [sys, id] = key.split('.');
  if (sys === 'instruments' && (id === 'recal' || id === 'swap')) {
    const S = CONFIG.sensors;
    return id === 'recal'
      ? { label: 'Recalibrate', dur: S.recalDur, cd: S.recalCd }
      : { label: 'Swap sensor', dur: S.swapDur, cd: S.swapCd, cost: { spares: 1 } };
  }
  return ctlSpecs[`${sys}.${id}`];
}

export function crewFactor(sim) {
  const C = CONFIG.model.cons;
  return C.crewBase + C.crewRation * (sim.ctl['consumables.ration'].eff / 100);
}

/** Supply orders: one job per item, but only one delivery may be on its way at a time. */
const stockOf = (sim, item) => (item === 'fuel' ? sim.v.fuel.level : sim.v.consumables[item]);
const stockMax = (item) => (item === 'fuel' ? 100 : channelOf('consumables', item).max);
export function orderInFlight(sim) {
  return Object.keys(sim.jobs).some((k) => k.startsWith('consumables.order') && sim.jobs[k].active);
}

export function jobInfo(sim, key) {
  const j = sim.jobs[key], spec = jobSpec(key);
  const cooling = !j.active && sim.t < j.cdUntil;
  let reason = '';
  if (sim.over) reason = 'Station lost';
  else if (j.active) reason = 'In progress';
  else if (spec.order && orderInFlight(sim)) reason = 'Another delivery is on its way';
  else if (cooling) reason = 'Cooling down';
  else if (spec.order && stockOf(sim, spec.order) >= stockMax(spec.order)) reason = 'Stock full';
  else if (spec.cost && spec.cost.spares && sim.v.consumables.spares < spec.cost.spares) reason = 'No spares';
  return {
    key, spec, active: j.active, cooling, canStart: reason === '', reason,
    progress: j.active ? clamp((sim.t - j.start) / Math.max(1, j.end - j.start), 0, 1) : 0,
    secLeft: j.active ? Math.max(0, j.end - sim.t) : cooling ? j.cdUntil - sim.t : 0,
  };
}

export function startJob(sim, key, { log = true } = {}) {
  if (sim.paused) return false;
  const info = jobInfo(sim, key);
  if (!info.canStart) return false;
  const j = sim.jobs[key], spec = info.spec;
  const [sys, id, arg] = key.split('.');
  if (spec.cost && spec.cost.spares) sim.v.consumables.spares -= spec.cost.spares;
  let dur = spec.dur;
  if (key === 'hull.patch') dur = spec.dur / crewFactor(sim);
  if (spec.order) dur = spec.dur + sim.mods.supplyDelay;
  j.active = true; j.start = sim.t; j.end = sim.t + dur;
  if (log) pushLog(sim, sys, 'player', 0, `You: ${spec.label}${arg ? ' (' + SYSTEM_BY_ID[arg].name + ')' : ''}.`);
  return true;
}

function jobDone(sim, key) {
  const j = sim.jobs[key], spec = jobSpec(key);
  const [sys, id, arg] = key.split('.');
  const H = CONFIG.model.hull;
  j.active = false;
  j.cdUntil = sim.t + spec.cd;
  if (id === 'maint') {
    sim.wear[sys] = Math.max(0, sim.wear[sys] - CONFIG.wear.maintRelief);
    sim.lastMaint[sys] = sim.t;
    if (sys === 'hull') sim.v.hull.integrity = Math.min(100, sim.v.hull.integrity + H.maintHeal);
    if (sys === 'instruments') for (const s of Object.values(sim.sensors)) { s.bias = 0; s.health = Math.min(100, s.health + 20); }
    pushLog(sim, sys, 'player', 0, `${SYSTEM_BY_ID[sys].name} maintenance finished.`);
  } else if (key === 'hull.patch') {
    onPatch(sim);
    sim.v.hull.integrity = Math.min(100, sim.v.hull.integrity + H.patchHeal);
    pushLog(sim, 'hull', 'player', 0, 'Patch crew finished work and returned.');
  } else if (key === 'comms.buoy') {
    sim.buoyAt = sim.t;
    pushLog(sim, 'comms', 'player', 0, 'Buoy deployed.');
  } else if (key === 'airlock.cycle') {
    sim.v.airlock.seal = Math.min(100, sim.v.airlock.seal + CONFIG.model.airlock.cycleSeal);
    pushLog(sim, 'airlock', 'player', 0, 'Airlock cycle complete.');
  } else if (key === 'airlock.equalize') {
    sim.ou['airlock.dp'] = 0;
    pushLog(sim, 'airlock', 'player', 0, 'Airlock equalized.');
  } else if (spec.order) {
    const item = spec.order, amt = CONFIG.model.cons.resupply[item];
    if (item === 'fuel') sim.v.fuel.level = Math.min(100, sim.v.fuel.level + amt);
    else sim.v.consumables[item] = Math.min(stockMax(item), sim.v.consumables[item] + amt);
    sim.lastDelivery = sim.t;
    pushLog(sim, 'consumables', 'event', 0, `Supply: ${item} delivery arrived.`);
  } else if (id === 'recal') {
    const s = sim.sensors[arg];
    s.bias = 0; s.offsets = {};
    pushLog(sim, 'instruments', 'player', 0, `${SYSTEM_BY_ID[arg].name} gauge recalibrated.`);
  } else if (id === 'swap') {
    sim.sensors[arg] = { health: 100, bias: 0, offsets: {}, n: {}, noiseMul: 1, stuck: false, stuckVal: {}, dropout: false };
    pushLog(sim, 'instruments', 'player', 0, `${SYSTEM_BY_ID[arg].name} gauge swapped for a new sensor.`);
  }
}

function stepJobs(sim) {
  for (const key in sim.jobs) {
    const j = sim.jobs[key];
    if (j.active && sim.t >= j.end) jobDone(sim, key);
  }
}

/* ------------------------------------------------------------------- plant */

function stepPlant(sim, dt) {
  const M = CONFIG.model, v = sim.v, mods = sim.mods, dm = sim.dm;
  const c = (k) => sim.ctl[k].eff;
  const w = (id) => sim.wear[id] / 100;
  const ou = (key, id) => {
    const d = CONFIG.drift[key];
    sim.ou[key] = ouStep(sim, sim.ou[key] || 0, d.sd, d.tau, dt, dm.drift * (1 + sim.wear[id] / CONFIG.wear.driftFactor));
    return sim.ou[key];
  };

  // Power + fuel
  const P = M.power, L = P.loadPer;
  const fuelF = clamp(c('fuel.valve') / M.fuel.valveFull, 0, 1) * (v.fuel.level > 0 ? 1 : 0);
  const gen = c('power.throttle') * P.genCap * fuelF * mods.eff.gen * (1 - w('power') * P.wearLoss);
  const outT = gen > 0 ? Math.max(0, gen + ou('power.out', 'power')) : 0;
  v.power.output = relax(v.power.output, outT, 20, dt);
  const loadT = Math.max(5, P.baseLoad + L.scrubber * c('air.scrubber') + L.o2 * c('air.o2feed') + L.desal * c('water.desal')
    + L.processor * c('waste.processor') + L.gain * c('comms.gain') + L.pump * c('hull.pump') + L.ballast * Math.abs(c('ballast.tanks') - 50)
    + mods.extraLoad + (sim.jobs['airlock.cycle'].active ? P.cycleLoad : 0)
    - P.shed.labs * c('power.shedLabs') - P.shed.comms * c('power.shedComms') + ou('power.load', 'power'));
  v.power.load = relax(v.power.load, loadT, 15, dt);
  v.power.battery = clamp(v.power.battery + (v.power.output - v.power.load) * P.batteryRate * dt, 0, 100);
  sim.pf = v.power.output >= v.power.load * 0.98 || v.power.battery > P.brown ? 1 : clamp(v.power.output / Math.max(1, v.power.load), 0.15, 1);
  const pf = sim.pf;
  v.fuel.level = clamp(v.fuel.level - v.power.output * M.fuel.burnPerKw * dt, 0, 100);
  v.fuel.burn = relax(v.fuel.burn, v.power.output * M.fuel.burnPerKw * 60, 20, dt);

  // Air
  const A = M.air, f = v.consumables.filters;
  const filterF = f <= 0 ? A.noFilterEff : f < A.lowFilter ? A.lowFilterEff : 1;
  const scrubEff = clamp(c('air.scrubber') / 100, 0, 1) * pf * filterF * mods.eff.scrub * (1 - w('air') * A.wearScrub);
  v.air.scrubOut = relax(v.air.scrubOut, scrubEff * 100, 15, dt);
  const co2T = A.co2Base + A.co2K / (v.air.scrubOut / 100 + A.co2Soft) + Math.max(0, v.waste.tank - A.wasteStart) * A.wasteK + ou('air.co2', 'air');
  v.air.co2 = relax(v.air.co2, co2T, 90, dt);
  const o2T = A.o2Base + c('air.o2feed') * A.o2PerFeed * pf * mods.eff.o2 * (1 - w('air') * 0.1) + ou('air.o2', 'air');
  v.air.o2 = relax(v.air.o2, o2T, 60, dt);
  const prT = 101.3 - v.hull.leak * A.leakPressure - c('waste.vent') * A.ventPressure + ou('air.pr', 'air');
  v.air.pr = relax(v.air.pr, prT, 25, dt);

  // Hull
  const H = M.hull;
  const stormStress = mods.storm * H.stormStress * (1 - clamp((v.ballast.depth - 500) / H.stormDepthRelief, 0, 0.6));
  const stressT = H.stressBase + (v.ballast.depth - 500) * H.depthStress + stormStress + Math.abs(v.ballast.trim) * H.trimStress
    + w('hull') * H.wearStress + mods.stressAdd + ou('hull.stress', 'hull');
  v.hull.stress = relax(v.hull.stress, Math.max(0, stressT), 20, dt);
  v.hull.leak = relax(v.hull.leak, mods.leak + H.leakPerStress * Math.max(0, v.hull.stress - H.leakStressStart), 10, dt);
  const pumpOut = clamp(c('hull.pump') / 100, 0, 1) * pf * mods.eff.pump * (1 - w('hull') * H.pumpWear);
  v.hull.bilge = clamp(v.hull.bilge + (v.hull.leak * H.bilgePerLeak - pumpOut * H.pumpDrain) * dt, 0, 100);
  const dmg = v.hull.leak * H.dmgLeak + Math.max(0, v.hull.bilge - H.bilgeDmgStart) * H.dmgBilge + Math.max(0, v.hull.stress - H.stressDmgStart) * H.dmgStress;
  const heal = v.hull.leak < 0.1 && v.hull.stress < 60 ? H.selfHeal : 0;
  v.hull.integrity = clamp(v.hull.integrity + (heal - dmg) * dt, 0, 100);

  // Ballast
  const B = M.ballast;
  const trimT = (c('ballast.tanks') - 50) * B.trimGain * mods.eff.ballast + ou('ballast.bias', 'ballast') + mods.storm * B.stormLift;
  v.ballast.trim = relax(v.ballast.trim, trimT, 25, dt);
  v.ballast.depth = clamp(v.ballast.depth + (-v.ballast.trim * B.depthRate - (v.ballast.depth - B.nominalDepth) * B.restore) * dt, 300, 700);

  // Water
  const W = M.water;
  v.water.flow = relax(v.water.flow, c('water.desal') * W.flowGain * pf * mods.eff.desal * (1 - w('water') * W.wearLoss), 30, dt);
  const cons = W.consumption * (c('consumables.ration') / 100) + ou('water.cons', 'water');
  v.water.level = clamp(v.water.level + (v.water.flow - cons) * W.levelRate * dt, 0, 100);
  const salT = W.salBase + c('water.desal') * W.salPerRate + w('water') * W.salWear + Math.max(0, v.waste.tank - W.wasteStart) * W.wasteK + ou('water.sal', 'water');
  v.water.sal = relax(v.water.sal, Math.max(0, salT), 40, dt);

  // Comms
  const Cm = M.comms;
  const buoy = Cm.buoy * clamp(1 - (sim.t - sim.buoyAt) / Cm.buoyDecay, 0, 1);
  let sigT = Cm.base + c('comms.gain') * Cm.gainK * mods.eff.antenna - mods.storm * Cm.storm - (v.ballast.depth - 500) * Cm.depth
    - c('power.shedComms') * Cm.shedComms + buoy + ou('comms.sig', 'comms');
  sigT *= 1 - Cm.powerWeight + Cm.powerWeight * pf;
  v.comms.sig = clamp(relax(v.comms.sig, Math.max(0, sigT), 15, dt), 0, 100);
  v.comms.link = v.comms.sig >= 45 ? 2 : v.comms.sig >= 20 ? 1 : 0;

  // Airlock
  const Lk = M.airlock, cycJ = sim.jobs['airlock.cycle'], eqJ = sim.jobs['airlock.equalize'];
  let dpT = (v.air.pr - 101.3) * Lk.pressureCoupling + ou('airlock.dp', 'airlock') + (cycJ.active ? Lk.cycleSpike : 0), dpTau = 30;
  if (eqJ.active) { dpT = 0; dpTau = 6; sim.ou['airlock.dp'] = 0; }
  v.airlock.dp = relax(v.airlock.dp, dpT, dpTau, dt);
  const adp = Math.abs(v.airlock.dp);
  v.airlock.seal = clamp(v.airlock.seal - (Math.max(0, adp - Lk.sealDmgStart) * Lk.sealDmg + Lk.sealBase + w('airlock') * Lk.sealWear) * dt, 0, 100);
  v.airlock.cycle = cycJ.active ? 1 : eqJ.active ? 2 : 0;

  // Waste
  const Wt = M.waste;
  const prod = Wt.prod * (1 + ou('waste.prod', 'waste'));
  v.waste.rate = relax(v.waste.rate, clamp(c('waste.processor'), 0, 100) * pf * mods.eff.processor * (1 - w('waste') * Wt.wearLoss), 10, dt);
  v.waste.tank = clamp(v.waste.tank + (prod - (v.waste.rate / 100) * Wt.procGain - c('waste.vent') * Wt.ventRate) * dt, 0, 100);

  // Supplies
  const Cs = M.cons;
  v.consumables.food = Math.max(0, v.consumables.food - Cs.foodPerSec * (c('consumables.ration') / 100) * dt);
  v.consumables.filters = Math.max(0, v.consumables.filters - Cs.filterPerSec * (c('air.scrubber') / Cs.scrubRef) * dt);
}

/* ----------------------------------------------------------------- sensors */

function stepSensors(sim, dt) {
  const S = CONFIG.sensors, dmD = sim.dm.drift;
  const labsShed = sim.ctl['power.shedLabs'].eff;
  let minHealth = 100, maxErr = 0;
  for (const sys of SENSOR_SYSTEMS) {
    const s = sim.sensors[sys], sd = SYSTEM_BY_ID[sys];
    const wear = sim.wear[sys];
    s.health = Math.max(0, s.health - (S.healthDecay + S.healthDecayWear * wear) * dt * dmD);
    const bias = S.biasSd * (1 + (100 - s.health) / S.biasHealthScale) * dmD * (1 + 0.5 * labsShed);
    s.bias = clamp(s.bias + bias * Math.sqrt(dt) * gauss(sim), -0.5, 0.5);
    const noise = S.noiseSd * s.noiseMul * (1 + (100 - s.health) / S.noiseHealthScale) * (1 + wear / CONFIG.wear.sensorFactor);
    for (const ch of sd.channels) {
      if (ch.derived) continue;
      s.n[ch.id] = ouStep(sim, s.n[ch.id] || 0, noise, S.noiseTau, dt);
      const span = ch.max - ch.min;
      if (s.dropout) sim.shown[sys][ch.id] = null;
      else if (s.stuck) sim.shown[sys][ch.id] = s.stuckVal[ch.id];
      else sim.shown[sys][ch.id] = clamp(sim.v[sys][ch.id] + (s.bias + (s.offsets[ch.id] || 0) + s.n[ch.id]) * span, ch.min, ch.max);
    }
    minHealth = Math.min(minHealth, s.health);
    const off = Math.max(0, ...Object.values(s.offsets).map(Math.abs));
    maxErr = Math.max(maxErr, (Math.abs(s.bias) + off) * 100);
  }
  // Derived readouts
  const sig = sim.shown.comms.sig;
  sim.shown.comms.link = sig == null ? null : sig >= 45 ? 2 : sig >= 20 ? 1 : 0;
  sim.shown.airlock.cycle = sim.v.airlock.cycle;
  // Instruments report their own self-test truthfully
  sim.v.instruments.health = minHealth;
  sim.v.instruments.calerr = maxErr;
  sim.shown.instruments.health = minHealth;
  sim.shown.instruments.calerr = maxErr;
}

/* ------------------------------------------------------------------ states */

function evaluateStates(sim, dt, silent = false) {
  for (const sd of CONFIG.systems) {
    const st = sim.st[sd.id];
    let worstT = 0, worstS = 0, anyShown = false, worstCh = null;
    for (const ch of sd.channels) {
      if (!ch.bands) continue;
      const it = stateIndex(ch, sim.v[sd.id][ch.id]);
      st.chT[ch.id] = it;
      worstT = Math.max(worstT, it);
      const sv = sim.shown[sd.id][ch.id];
      if (sv != null) {
        anyShown = true;
        const is = stateIndex(ch, sv);
        if (is >= worstS) { worstS = is; if (is > 0) worstCh = ch; }
      }
    }
    st.t = worstT;
    st.noData = !anyShown;
    const raw = anyShown ? worstS : 1;
    const prev = st.s;
    if (raw >= st.s) { st.s = raw; st.hold = 0; }
    else { st.hold += dt; if (st.hold >= 8) { st.s = Math.max(raw, st.s - 1); st.hold = 0; } }
    if (!silent) {
      if (st.s !== prev) {
        if (st.s === 0) pushLog(sim, sd.id, 'state', 0, `${sd.name} back to normal.`);
        else if (st.s > prev) {
          const what = st.noData ? 'no signal from gauge' : worstCh ? `${worstCh.label} ${formatValue(worstCh, sim.shown[sd.id][worstCh.id])}${worstCh.unit ? ' ' + worstCh.unit : ''}` : '';
          pushLog(sim, sd.id, 'state', st.s, `${sd.name}: ${STATE_META[STATES[st.s]].long}${what ? ' (' + what + ')' : ''}.`);
        } else pushLog(sim, sd.id, 'state', st.s, `${sd.name} improving: ${STATE_META[STATES[st.s]].long}.`);
      }
      sim.timeIn[sd.id].total += dt;
      if (st.t === 0) sim.timeIn[sd.id].healthy += dt;
    }
  }
}

export function loseCritical(sim, sys) {
  const st = sim.st[sys];
  if (sys === 'hull') return CONFIG.lose.hull.some((c) => st.chT[c] === 3);
  return st.t === 3;
}

function checkLose(sim, dt) {
  const G = CONFIG.lose;
  for (const sys of ['hull', 'air', 'power']) {
    if (loseCritical(sim, sys)) {
      sim.crit[sys] += dt;
      if (!sim.critLogged[sys]) {
        sim.critLogged[sys] = true;
        pushLog(sim, sys, 'alarm', 3, `STATION PROTECTION: ${SYSTEM_BY_ID[sys].name} critical. Station lost in ${G.grace} seconds unless it recovers.`);
      }
    } else {
      sim.crit[sys] = Math.max(0, sim.crit[sys] - dt * G.drain);
      if (sim.critLogged[sys] && sim.crit[sys] === 0) {
        sim.critLogged[sys] = false;
        pushLog(sim, sys, 'alarm', 0, `Station protection: ${SYSTEM_BY_ID[sys].name} recovered.`);
      }
    }
    if (sim.crit[sys] >= G.grace) { endRun(sim, sys); return; }
  }
}

export function critCountdown(sim) {
  let best = null;
  for (const sys of ['hull', 'air', 'power']) {
    if (sim.crit[sys] > 0 && sim.critLogged[sys]) {
      const left = CONFIG.lose.grace - sim.crit[sys];
      if (!best || left < best.left) best = { sys, left };
    }
  }
  return best;
}

function endRun(sim, sys) {
  sim.over = true;
  const stability = {};
  for (const s of CONFIG.systems) stability[s.id] = Math.round((100 * sim.timeIn[s.id].healthy) / Math.max(1, sim.timeIn[s.id].total));
  sim.endInfo = {
    sys, name: SYSTEM_BY_ID[sys].name, t: sim.t, days: sim.t / 3600,
    chain: buildCauseChain(sim, sys), stability, lastLog: sim.log.slice(-14),
  };
  pushLog(sim, sys, 'alarm', 3, `${SYSTEM_BY_ID[sys].name} stayed critical too long. The station is lost.`);
}

export function buildCauseChain(sim, sys) {
  const recent = [...sim.history.filter((h) => h.t1 > sim.t - 600).map((h) => ({ ...h, open: false })), ...sim.events.map((e) => ({ uid: e.uid, title: e.title, cause: e.cause, t0: e.t0, parent: e.parent, open: true }))]
    .sort((a, b) => a.t0 - b.t0);
  const lines = recent.map((e) => ({ t: e.t0, text: e.cause || e.title, open: e.open, chained: !!e.parent }));
  lines.push({ t: sim.t, text: `${SYSTEM_BY_ID[sys].name} stayed at Critical for ${CONFIG.lose.grace} seconds. Station lost.`, open: true, final: true });
  return lines;
}

/* -------------------------------------------------------------------- wear */

function stepWear(sim, dt) {
  const W = CONFIG.wear;
  for (const sd of CONFIG.systems) {
    if (!hasWear(sd)) { sim.wear[sd.id] = 0; continue; }
    const inc = W.base + W.byState[sim.st[sd.id].t];
    sim.wear[sd.id] = clamp(sim.wear[sd.id] + inc * dt, 0, 100);
  }
}

/* ------------------------------------------------------------------- trend */

const TREND_EVERY = 5, TREND_MAX = 360;
function sampleTrend(sim, dt) {
  sim.trendClock += dt;
  if (sim.trendClock < TREND_EVERY) return;
  sim.trendClock -= TREND_EVERY;
  for (const sd of CONFIG.systems) for (const ch of sd.channels) {
    const arr = sim.trend[sd.id][ch.id];
    const val = sim.shown[sd.id][ch.id];
    arr.push(val == null ? null : Math.round(val * 100) / 100);
    if (arr.length > TREND_MAX) arr.shift();
  }
}

/* -------------------------------------------------------------------- tick */

export function tick(sim, dt = DT) {
  if (sim.over || sim.paused) return;
  sim.t += dt;
  const mods = freshMods();
  sim.mods = mods;
  applyEvents(sim, mods);
  stepControls(sim, dt);
  stepJobs(sim);
  stepPlant(sim, dt);
  stepSensors(sim, dt);
  evaluateStates(sim, dt);
  checkLose(sim, dt);
  stepWear(sim, dt);
  updateEvents(sim, dt);
  sampleTrend(sim, dt);
}

export function run(sim, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && !sim.over; i++) tick(sim, DT);
}

export function forceEvent(sim, def, params) {
  const ev = forceEventRaw(sim, def, params);
  return ev;
}

/* ------------------------------------------------------------------ helpers */

export function overallState(sim) {
  return Math.max(...CONFIG.systems.map((s) => sim.st[s.id].s));
}

export function serializeSim(sim) {
  const { mods, dm, ...rest } = sim;
  return JSON.parse(JSON.stringify(rest));
}

export function restoreSim(obj) {
  if (!obj || obj.version !== CONFIG.saveVersion) return null;
  const sim = obj;
  sim.dm = CONFIG.difficulty[sim.diff];
  if (!sim.dm) return null;
  // JSON turns Infinity into null; put it back.
  for (const ev of sim.events) if (ev.esc == null) ev.esc = Infinity;
  if (sim.nextEventAt == null) sim.nextEventAt = Infinity;
  if (sim.nextCrisisAt == null) sim.nextCrisisAt = Infinity;
  // Older saves: add any control or job that did not exist yet (for example the per-item supply orders), drop the retired one.
  delete sim.jobs['consumables.order'];
  for (const sd of CONFIG.systems) if (!hasWear(sd)) sim.wear[sd.id] = 0; // older saves wore these out
  for (const sd of CONFIG.systems) for (const c of sd.controls) {
    const key = `${sd.id}.${c.id}`;
    if (c.type === 'job') sim.jobs[key] ??= { active: false, start: 0, end: 0, cdUntil: 0 };
    else sim.ctl[key] ??= { set: c.def, eff: c.def, vel: 0, zeta: 1, from: c.def };
  }
  sim.mods = freshMods();
  sim.paused = false;
  return sim;
}
