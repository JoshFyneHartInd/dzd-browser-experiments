// Event definitions and lifecycle. No DOM. Imported by sim.js (never the other way round).
import { CONFIG, SENSOR_SYSTEMS, SYSTEM_BY_ID, channelOf } from './config.js';
import { rand, randRange, pick, weightedPick, clamp } from './util.js';

const E = CONFIG.events;

/** Observable log entry. Text must describe what the player can see, not hidden causes. */
export function pushLog(sim, sys, kind, sev, text) {
  sim.log.push({ t: sim.t, sys, kind, sev, text });
  if (sim.log.length > 400) sim.log.splice(0, sim.log.length - 400);
}

const live = (sim) => sim.events.filter((e) => !e.resolved);
const liveOf = (sim, def) => live(sim).filter((e) => e.def === def);
const sysName = (id) => SYSTEM_BY_ID[id].name;
const lowIsBad = (ch) => ch.bands && ch.bands.ok[1] === Infinity;
const highIsBad = (ch) => ch.bands && ch.bands.ok[0] <= ch.min;

function badDisplayTarget(ch, dir) {
  const b = ch.bands;
  if (dir < 0) return (b.alert[0] + b.caution[0]) / 2;
  return (b.caution[1] + b.alert[1]) / 2;
}

export function newEvent(sim, def, params = {}, parent = null) {
  const d = DEFS[def];
  const ev = {
    uid: ++sim.uid, def, title: '', system: '', t0: sim.t, stage: 0, p: { ...params },
    parent: parent ? parent.uid : null, depth: parent ? parent.depth + 1 : 0, crisis: !!d.crisis,
    cause: '', resolved: false, esc: Infinity,
  };
  if (!d.init(sim, ev)) return null;
  if (d.maxStage > 0) ev.esc = sim.t + E.escalate[d.escKey || def] * sim.dm.chain;
  sim.events.push(ev);
  return ev;
}

const DEFS = {
  leak: {
    maxStage: 2,
    canStart: (sim) => liveOf(sim, 'leak').length === 0,
    init(sim, ev) {
      const size = ev.p.size || (rand(sim) < 0.65 ? 'small' : 'large');
      ev.p.size = size;
      ev.p.rate = E.leakRates[size];
      ev.system = 'hull';
      ev.title = 'Hull moisture report';
      ev.cause = `Hull leak (${size}, ${ev.p.rate} L/min)`;
      pushLog(sim, 'hull', 'event', 1, 'Hull: crew reports moisture on the lower deck.');
      return true;
    },
    apply: (sim, ev, mods) => { mods.leak += ev.p.rate; },
    resolved: (sim, ev) => ev.p.rate < E.leakResolved,
    escalate(sim, ev) {
      if (ev.stage === 0) {
        ev.p.rate *= 1.6;
        if (ev.depth < E.maxChainDepth && !liveOf(sim, 'bilge').length) newEvent(sim, 'bilge', {}, ev);
        pushLog(sim, 'hull', 'event', 2, 'Hull: bilge pumps are working hard.');
      } else {
        ev.p.rate *= 1.3;
        sim.v.hull.integrity = Math.max(0, sim.v.hull.integrity - 5);
        pushLog(sim, 'hull', 'event', 2, 'Hull: crew reports structural creaking near the leak.');
      }
    },
  },

  bilge: {
    maxStage: 1,
    canStart: () => false,
    init(sim, ev) {
      ev.system = 'hull';
      ev.title = 'Pump overload';
      ev.cause = 'Flooded bilge overloading the pumps';
      return true;
    },
    apply(sim, ev, mods) {
      mods.extraLoad += CONFIG.model.power.bilgeFlood;
      mods.eff.pump *= 0.8;
      if (ev.stage >= 1) mods.eff.gen *= 0.85;
    },
    // Pumps stay overloaded until the leak is sealed and the bilge has been drained.
    resolved: (sim) => sim.mods.leak < 0.6 && sim.v.hull.bilge < 25,
    escalate(sim, ev) {
      ev.cause = 'Flooded bilge overloading the pumps, then fouling the generator switchgear';
      pushLog(sim, 'power', 'event', 2, 'Power: output sagging, electrical faults reported near the bilge.');
    },
  },

  storm: {
    maxStage: 1,
    canStart: (sim) => liveOf(sim, 'storm').length === 0,
    init(sim, ev) {
      ev.p.dur = randRange(sim, E.stormDur[0], E.stormDur[1]);
      ev.p.sev = 1;
      ev.system = 'comms';
      ev.title = 'Surface storm warning';
      ev.cause = 'Surface storm';
      pushLog(sim, 'comms', 'event', 1, 'Weather: storm front reported overhead. Swell is rising.');
      return true;
    },
    apply(sim, ev, mods) {
      const age = sim.t - ev.t0;
      let l = Math.min(1, age / 30);
      if (age > ev.p.dur) l = Math.max(0, 1 - (age - ev.p.dur) / 30);
      mods.storm = Math.max(mods.storm, l * ev.p.sev);
    },
    resolved: (sim, ev) => sim.t - ev.t0 > ev.p.dur + 30,
    escalate(sim, ev) {
      if (sim.v.hull.stress > 70 && ev.depth < E.maxChainDepth) {
        ev.cause = 'Surface storm that overstressed the hull and opened a leak';
        newEvent(sim, 'leak', { size: 'small' }, ev);
        pushLog(sim, 'hull', 'event', 2, 'Weather: storm intensifying. Hull groaning under load.');
      } else {
        ev.p.sev = 1.3;
        pushLog(sim, 'comms', 'event', 1, 'Weather: storm intensifying.');
      }
    },
  },

  equip: {
    maxStage: 1,
    canStart(sim) {
      return CONFIG.equipVariants.some((v) => !liveOf(sim, 'equip').some((e) => e.system === v.sys));
    },
    init(sim, ev) {
      const free = CONFIG.equipVariants.filter((v) => !liveOf(sim, 'equip').some((e) => e.system === v.sys));
      const pool = ev.p.sys ? free.filter((v) => v.sys === ev.p.sys) : free;
      if (!pool.length) return false;
      const v = ev.p.key ? pool.find((x) => x.key === ev.p.key) || pick(sim, pool) : pick(sim, pool);
      ev.system = v.sys;
      ev.p.key = v.key;
      ev.title = v.title;
      ev.cause = `${sysName(v.sys)} equipment fault (${v.key})`;
      pushLog(sim, v.sys, 'event', 1, `Maintenance advisory: ${sysName(v.sys)} efficiency anomaly.`);
      return true;
    },
    apply(sim, ev, mods) {
      mods.eff[ev.p.key] *= ev.stage >= 1 ? E.equipEffEscalated : E.equipEff;
    },
    resolved: (sim, ev) => sim.lastMaint[ev.system] >= ev.t0,
    escalate(sim, ev) {
      const next = CONFIG.equipChain[ev.system];
      if (next && ev.depth < E.maxChainDepth && !liveOf(sim, 'equip').some((e) => e.system === next)) {
        ev.cause += ', degrading further and spreading to ' + sysName(next);
        newEvent(sim, 'equip', { sys: next }, ev);
      }
      pushLog(sim, ev.system, 'event', 2, `Maintenance advisory: ${sysName(ev.system)} efficiency has dropped further.`);
    },
  },

  sensor: {
    maxStage: 1,
    canStart: (sim) => SENSOR_SYSTEMS.some((s) => sensorFree(sim, s)),
    init(sim, ev) {
      const free = ev.p.sys ? [ev.p.sys].filter((s) => sensorFree(sim, s)) : SENSOR_SYSTEMS.filter((s) => sensorFree(sim, s));
      if (!free.length) return false;
      const sys = pick(sim, free);
      const mode = ev.p.mode || weightedPick(sim, [{ item: 'stuck', w: 0.3 }, { item: 'dropout', w: 0.25 }, { item: 'phantom', w: 0.45 }]);
      const s = sim.sensors[sys];
      ev.system = sys;
      ev.p.mode = mode;
      ev.title = 'Instrument fault';
      if (mode === 'stuck') {
        s.stuck = true;
        s.stuckVal = {};
        for (const ch of SYSTEM_BY_ID[sys].channels) s.stuckVal[ch.id] = sim.shown[sys][ch.id] ?? sim.v[sys][ch.id];
        s.health = Math.min(s.health, CONFIG.sensors.stuckHealth);
        ev.cause = `${sysName(sys)} gauge stuck on its last reading`;
      } else if (mode === 'dropout') {
        s.dropout = true;
        s.health = Math.min(s.health, CONFIG.sensors.dropoutHealth);
        ev.cause = `${sysName(sys)} gauge lost signal`;
      } else {
        const sd = SYSTEM_BY_ID[sys];
        const ch = channelOf(sys, sd.primary);
        let dir = lowIsBad(ch) ? -1 : highIsBad(ch) ? 1 : (rand(sim) < 0.5 ? -1 : 1);
        const span = ch.max - ch.min;
        const target = badDisplayTarget(ch, dir);
        let frac = (target - sim.v[sys][ch.id]) / span;
        if (Math.abs(frac) < 0.1) frac = dir * randRange(sim, E.phantomOffset[0], E.phantomOffset[1]);
        s.offsets[ch.id] = clamp(frac, -0.6, 0.6);
        ev.p.ch = ch.id;
        s.health = Math.min(s.health, CONFIG.sensors.phantomHealth);
        ev.cause = `${sysName(sys)} gauge reading falsely ${dir < 0 ? 'low' : 'high'} (the system itself was fine)`;
      }
      return true;
    },
    apply() {},
    resolved(sim, ev) {
      const s = sim.sensors[ev.system];
      if (ev.p.mode === 'stuck') return !s.stuck;
      if (ev.p.mode === 'dropout') return !s.dropout;
      return Math.abs(s.offsets[ev.p.ch] || 0) < 0.05;
    },
    escalate(sim, ev) {
      sim.sensors[ev.system].noiseMul *= 2;
      const next = CONFIG.sensorLink[ev.system];
      if (next && ev.depth < E.maxChainDepth && sensorFree(sim, next)) {
        ev.cause += ', spreading bad data to the ' + sysName(next) + ' gauge';
        newEvent(sim, 'sensor', { sys: next, mode: 'phantom' }, ev);
      }
    },
  },

  supply: {
    maxStage: 1,
    canStart: (sim) => liveOf(sim, 'supply').length === 0,
    init(sim, ev) {
      ev.p.extra = E.supplyExtra;
      ev.system = 'consumables';
      ev.title = 'Supply tender delayed';
      ev.cause = 'Supply tender delayed';
      for (const k in sim.jobs) if (k.startsWith('consumables.order') && sim.jobs[k].active) sim.jobs[k].end += ev.p.extra;
      pushLog(sim, 'consumables', 'event', 1, 'Supply: tender delayed. Resupply ETAs extended.');
      return true;
    },
    apply: (sim, ev, mods) => { mods.supplyDelay += ev.p.extra; },
    resolved: (sim, ev) => sim.lastDelivery >= ev.t0 || sim.t - ev.t0 > E.supplyDur,
    escalate(sim, ev) {
      if (sim.v.consumables.filters < 5 && ev.depth < E.maxChainDepth && !liveOf(sim, 'equip').some((e) => e.system === 'air')) {
        ev.cause = 'Supply tender delayed until filters ran short, so the scrubber bed degraded';
        newEvent(sim, 'equip', { sys: 'air', key: 'scrub' }, ev);
      } else {
        ev.p.extra += 120;
      }
      pushLog(sim, 'consumables', 'event', 2, 'Supply: tender still delayed. ETAs extended again.');
    },
  },

  crisis_breach: {
    crisis: true, maxStage: 1, escKey: 'leak',
    canStart: () => false,
    init(sim, ev) {
      ev.system = 'hull';
      ev.title = 'CRISIS: hull pressure surge';
      ev.cause = 'Sudden hull breach';
      ev.p.rate = E.breachRate;
      ev.p.warnEnd = sim.t + E.crisisWarn;
      ev.p.active = false;
      pushLog(sim, 'hull', 'alarm', 3, `CRISIS WARNING: hull pressure surge predicted in ${E.crisisWarn} seconds.`);
      return true;
    },
    apply(sim, ev, mods) {
      if (sim.t < ev.p.warnEnd) return;
      if (!ev.p.active) {
        ev.p.active = true;
        ev.esc = sim.t + E.breachEscalate * sim.dm.chain;
        pushLog(sim, 'hull', 'alarm', 3, 'Hull: breach. Pressure is falling.');
      }
      mods.leak += ev.p.rate;
      mods.stressAdd += E.breachStress;
    },
    resolved: (sim, ev) => ev.p.active && ev.p.rate < E.breachResolved,
    escalate(sim, ev) {
      if (!ev.p.active) { ev.esc = Infinity; return; }
      ev.p.rate *= 1.4;
      sim.v.hull.integrity = Math.max(0, sim.v.hull.integrity - 8);
      pushLog(sim, 'hull', 'alarm', 3, 'Hull: breach is widening.');
    },
  },

  crisis_trip: {
    crisis: true, maxStage: 0,
    canStart: () => false,
    init(sim, ev) {
      ev.system = 'power';
      ev.title = 'CRISIS: generator overheat';
      ev.cause = 'Generator overheated and tripped offline';
      ev.p.warnEnd = sim.t + E.crisisWarn;
      ev.p.tripEnd = ev.p.warnEnd + E.tripDur;
      ev.p.averted = false;
      ev.p.decided = false;
      pushLog(sim, 'power', 'alarm', 3, `CRISIS WARNING: generator overheating. Trip expected in ${E.crisisWarn} seconds.`);
      return true;
    },
    apply(sim, ev, mods) {
      if (sim.t < ev.p.warnEnd) {
        if (sim.ctl['power.throttle'].set <= E.tripAvertThrottle) ev.p.averted = true;
        return;
      }
      if (!ev.p.decided) {
        ev.p.decided = true;
        pushLog(sim, 'power', 'alarm', ev.p.averted ? 1 : 3, ev.p.averted ? 'Power: generator temperature falling.' : 'Power: generator tripped offline.');
      }
      if (!ev.p.averted) mods.eff.gen *= 0;
    },
    resolved: (sim, ev) => (ev.p.averted && sim.t >= ev.p.warnEnd) || sim.t >= ev.p.tripEnd,
    escalate() {},
  },
};

function sensorFree(sim, sys) {
  const s = sim.sensors[sys];
  if (s.stuck || s.dropout) return false;
  return !Object.values(s.offsets).some((o) => Math.abs(o) >= 0.05);
}

export const EVENT_DEFS = DEFS;

export function applyEvents(sim, mods) {
  for (const ev of sim.events) if (!ev.resolved) DEFS[ev.def].apply(sim, ev, mods);
}

/** A patch crew seals existing leaks. */
export function onPatch(sim) {
  const f = CONFIG.model.hull.patchFactor;
  for (const ev of live(sim)) {
    if ((ev.def === 'leak' || (ev.def === 'crisis_breach' && ev.p.active))) ev.p.rate *= f;
  }
}

export function forceEvent(sim, def, params = {}) {
  if (!DEFS[def]) return null;
  return newEvent(sim, def, params);
}

function resolveEvent(sim, ev) {
  ev.resolved = true;
  ev.t1 = sim.t;
  sim.history.push({ uid: ev.uid, def: ev.def, system: ev.system, title: ev.title, cause: ev.cause, t0: ev.t0, t1: sim.t, parent: ev.parent, stage: ev.stage, crisis: ev.crisis });
  if (sim.history.length > 200) sim.history.shift();
  if (ev.def !== 'bilge') pushLog(sim, ev.system, 'notice', 0, `Notice cleared: ${ev.title}.`);
  sim.events = sim.events.filter((e) => e !== ev);
}

export function scheduleInitial(sim) {
  const dm = sim.dm;
  sim.nextEventAt = Math.max(E.firstMin, randRange(sim, E.intervalMin, E.intervalMax) / dm.eventFreq);
  sim.nextCrisisAt = Math.max(E.crisisFirst, dm.crisisMean * randRange(sim, E.crisisJitter[0], E.crisisJitter[1]));
}

export function updateEvents(sim, dt) {
  const dm = sim.dm;
  for (const ev of [...sim.events]) {
    const d = DEFS[ev.def];
    if (d.resolved(sim, ev)) { resolveEvent(sim, ev); continue; }
    if (sim.t >= ev.esc) {
      d.escalate(sim, ev);
      ev.stage++;
      ev.esc = ev.stage >= d.maxStage ? Infinity : sim.t + E.escalate[d.escKey || ev.def] * dm.chain;
    }
  }

  // wear-driven equipment failures
  for (const sys of new Set(CONFIG.equipVariants.map((v) => v.sys))) {
    const w = sim.wear[sys] / 100;
    if (rand(sim) < ((w * w) / E.wearHazardSecs) * dt && live(sim).length < E.maxActive) newEvent(sim, 'equip', { sys });
  }

  const open = live(sim);
  const nonChain = open.filter((e) => !e.parent);

  if (sim.t >= sim.nextEventAt) {
    if ((sim.t < E.earlyWindow && nonChain.length >= 1) || open.length >= E.maxActive) {
      sim.nextEventAt = sim.t + 60;
    } else {
      const W = E.weights;
      const items = [
        { item: 'leak', w: W.leak }, { item: 'storm', w: W.storm }, { item: 'equip', w: W.equip },
        { item: 'sensor', w: W.sensor * dm.sensorFail }, { item: 'supply', w: W.supply },
      ].filter((i) => DEFS[i.item].canStart(sim));
      const def = weightedPick(sim, items);
      if (def) newEvent(sim, def);
      sim.nextEventAt = sim.t + randRange(sim, E.intervalMin, E.intervalMax) / dm.eventFreq;
    }
  }

  if (sim.t >= sim.nextCrisisAt) {
    const calm = open.every((e) => e.stage === 0 && !e.crisis) && nonChain.length <= 1;
    if (!calm) {
      sim.nextCrisisAt = sim.t + 120;
    } else {
      newEvent(sim, rand(sim) < 0.5 ? 'crisis_breach' : 'crisis_trip');
      sim.nextCrisisAt = sim.t + dm.crisisMean * randRange(sim, E.crisisJitter[0], E.crisisJitter[1]);
    }
  }
}

/** For the UI: active notices and crisis banner state. */
export function activeNotices(sim) {
  return live(sim)
    .filter((e) => e.def !== 'sensor' && e.def !== 'bilge')
    .map((e) => ({ uid: e.uid, title: e.title, system: e.system, stage: e.stage, crisis: e.crisis }));
}

export function crisisState(sim) {
  const ev = live(sim).find((e) => e.crisis);
  if (!ev) return null;
  const left = ev.p.warnEnd - sim.t;
  return { uid: ev.uid, title: ev.title, system: ev.system, phase: left > 0 ? 'warning' : 'active', secondsToEffect: Math.max(0, left), def: ev.def };
}
