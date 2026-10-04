// All tuning numbers live here. Times are REAL seconds unless noted.
const INF = Infinity;

export const STATES = ['healthy', 'caution', 'alert', 'critical'];
export const STATE_META = {
  healthy: { label: 'OK', long: 'Healthy' },
  caution: { label: 'Caution', long: 'Caution' },
  alert: { label: 'Alert', long: 'Alert' },
  critical: { label: 'Critical', long: 'Critical' },
};

// Theme contrast floor for Dark/Light groups (spec 9.1). One constant, tunable.
export const CONTRAST = {
  relaxedFloor: 3, // min ratio for text, icons, needles, state indicators in Dark/Light themes
  relaxedTextWarn: 4.5, // warn (not fail) when text pairs fall between floor and this
  coreText: 4.5,
  coreUi: 3,
  highContrastText: 7,
  highContrastUi: 7,
  stateDeltaE: 20, // min colour difference (CIE76) between any two state colours in non-mono themes
  coreCvdDeltaE: 12, // same, after simulating protan/deutan/tritan vision (Core themes only)
  highContrastCvdDeltaE: 15,
  monoStepL: 7, // mono themes: min lightness (L*) step between consecutive states
  monoHueSpread: 25, // mono themes: max hue spread (degrees) across the four state colours
  accentDeltaE: 18, buttonText: 7, // accent must stay this far from Alert and Critical (non-mono themes)
};

const ctl = {
  fader: (id, label, o) => ({ id, label, type: 'fader', min: 0, max: 100, step: 1, unit: '%', ...o }),
  toggle: (id, label, o) => ({ id, label, type: 'toggle', lag: 20, def: 0, ...o }),
  job: (id, label, o) => ({ id, label, type: 'job', ...o }),
};
// Supply orders: one job per item. Only one delivery can be on its way at a time; the cooldown only stops re-ordering the same item.
const ORDER = { dur: 240, cd: 60 };
const maint = ctl.job('maint', 'Maintenance', {
  dur: 90, cd: 60, cost: { spares: 1 },
  hint: 'Service this system. Uses 1 spare, lowers wear and clears equipment faults.',
});

export const CONFIG = {
  saveVersion: 1,
  time: { tickHz: 4, gameSecPerRealSec: 24 },

  difficulty: {
    quiet: { label: 'Quiet', blurb: 'Fewer events, slower drift, more time to react.', eventFreq: 0.6, drift: 0.7, chain: 1.5, sensorFail: 0.5, crisisMean: 14400 },
    standard: { label: 'Standard', blurb: 'The intended pace.', eventFreq: 1.0, drift: 1.0, chain: 1.0, sensorFail: 1.0, crisisMean: 7200 },
    rough: { label: 'Rough', blurb: 'Frequent events, faster drift, faster chains.', eventFreq: 1.6, drift: 1.4, chain: 0.7, sensorFail: 1.5, crisisMean: 3600 },
  },

  events: {
    intervalMin: 180, intervalMax: 300, // between scheduled events (before difficulty scaling)
    firstMin: 150, // never an event in the first 2.5 minutes
    earlyWindow: 900, // during this window never more than one active (non-chain) event
    maxActive: 3,
    maxChainDepth: 2,
    weights: { leak: 0.2, storm: 0.18, equip: 0.26, sensor: 0.24, supply: 0.12 },
    escalate: { leak: 240, bilge: 200, storm: 180, equip: 300, sensor: 360, supply: 240 },
    leakRates: { small: 1.2, large: 3.0 }, // L/min
    stormDur: [240, 360],
    supplyExtra: 180,
    supplyDur: 600,
    equipEff: 0.45, equipEffEscalated: 0.3,
    wearHazardSecs: 1800, // failure rate at 100% wear is 1 per this many seconds (scales with wear^2)
    crisisFirst: 1200, crisisWarn: 30, crisisJitter: [0.6, 1.4],
    breachRate: 9, breachStress: 20, breachEscalate: 90, breachResolved: 2.0, leakResolved: 0.5,
    tripDur: 150, tripAvertThrottle: 40,
    phantomOffset: [0.3, 0.4],
  },

  lose: { grace: 180, drain: 3, hull: ['integrity'] }, // timer drains 3x speed when not critical

  wear: {
    base: 0.002, // %/s always
    byState: [0, 0.004, 0.012, 0.03], // extra %/s by true state
    maintRelief: 25,
    driftFactor: 50, // drift multiplier = 1 + wear/this
    sensorFactor: 100, // noise multiplier = 1 + wear/this
  },

  sensors: {
    healthDecay: 0.0015, // %/s
    healthDecayWear: 0.00003, // extra %/s per wear%
    biasSd: 0.00015, // span fraction per sqrt(s) at full health
    biasHealthScale: 25,
    noiseSd: 0.002, noiseTau: 8, noiseHealthScale: 15,
    recalDur: 40, swapDur: 60, recalCd: 30, swapCd: 30,
    stuckHealth: 22, dropoutHealth: 30, phantomHealth: 45,
  },

  // Cross-system dependency coefficients (readable table; sim.js reads these)
  model: {
    power: { genCap: 1.0, baseLoad: 30, wearLoss: 0.3, batteryRate: 0.004, brown: 10,
      loadPer: { scrubber: 0.15, o2: 0.04, desal: 0.12, processor: 0.10, gain: 0.06, pump: 0.12, ballast: 0.08 },
      shed: { labs: 8, comms: 4 }, cycleLoad: 8, bilgeFlood: 10 },
    fuel: { valveFull: 50, burnPerKw: 0.00035 }, // burn in %/s per kW
    air: { co2Base: 350, co2K: 420, co2Soft: 0.2, noFilterEff: 0.25, lowFilterEff: 0.7, lowFilter: 2,
      wasteStart: 70, wasteK: 50, o2Base: 15, o2PerFeed: 0.12, leakPressure: 1.5, ventPressure: 1.2, wearScrub: 0.3 },
    hull: { stressBase: 28, depthStress: 0.04, trimStress: 1.2, wearStress: 15, stormStress: 35, stormDepthRelief: 150,
      leakPerStress: 0.05, leakStressStart: 85, bilgePerLeak: 0.012, pumpDrain: 0.06, pumpWear: 0.3,
      dmgLeak: 0.006, dmgBilge: 0.0008, bilgeDmgStart: 60, dmgStress: 0.003, stressDmgStart: 80, selfHeal: 0.0004,
      patchFactor: 0.15, patchHeal: 6, maintHeal: 4 },
    ballast: { trimGain: 0.4, depthRate: 0.012, restore: 0.0003, stormLift: 8, nominalDepth: 500 },
    water: { flowGain: 0.8, wearLoss: 0.4, consumption: 40, levelRate: 0.0008, salBase: 150, salPerRate: 1.4, salWear: 150, wasteStart: 60, wasteK: 4 },
    comms: { base: 35, gainK: 0.55, storm: 30, depth: 0.03, shedComms: 12, buoy: 15, buoyDecay: 600, powerWeight: 0.4 },
    airlock: { pressureCoupling: 0.8, cycleSpike: 4, cycleSeal: 5, sealDmgStart: 3, sealDmg: 0.004, sealBase: 0.003, sealWear: 0.01 },
    waste: { prod: 0.02, procGain: 0.04, ventRate: 0.08, wearLoss: 0.3 },
    cons: { foodPerSec: 1 / 60, filterPerSec: 1 / 360, scrubRef: 55, crewBase: 0.6, crewRation: 0.4,
      resupply: { food: 40, filters: 8, spares: 4, fuel: 40 }, orderDur: ORDER.dur, orderCd: ORDER.cd },
  },

  // Slow random walks (OU): sd in channel units, tau in seconds
  drift: {
    'power.out': { sd: 3, tau: 240 }, 'power.load': { sd: 3, tau: 300 },
    'air.co2': { sd: 60, tau: 300 }, 'air.o2': { sd: 0.15, tau: 400 }, 'air.pr': { sd: 0.3, tau: 300 },
    'hull.stress': { sd: 2, tau: 120 }, 'ballast.bias': { sd: 2.5, tau: 400 },
    'water.cons': { sd: 4, tau: 240 }, 'water.sal': { sd: 8, tau: 200 },
    'comms.sig': { sd: 3, tau: 200 }, 'airlock.dp': { sd: 0.6, tau: 900 }, 'waste.prod': { sd: 0.15, tau: 300 },
  },

  // Equipment faults: which actuator is degraded. key matches mods.eff keys.
  equipVariants: [
    { sys: 'power', key: 'gen', title: 'Power output anomaly' },
    { sys: 'air', key: 'scrub', title: 'Air handling efficiency anomaly' },
    { sys: 'air', key: 'o2', title: 'Air handling efficiency anomaly' },
    { sys: 'hull', key: 'pump', title: 'Hull systems efficiency anomaly' },
    { sys: 'ballast', key: 'ballast', title: 'Ballast response anomaly' },
    { sys: 'water', key: 'desal', title: 'Water plant efficiency anomaly' },
    { sys: 'comms', key: 'antenna', title: 'Comms efficiency anomaly' },
    { sys: 'waste', key: 'processor', title: 'Waste handling efficiency anomaly' },
  ],
  equipChain: { power: 'air', air: 'waste', hull: 'ballast', ballast: 'hull', water: 'waste', comms: 'power', waste: 'water' },
  sensorLink: { power: 'air', air: 'hull', hull: 'ballast', ballast: 'comms', water: 'waste', comms: 'power', airlock: 'hull', waste: 'water', consumables: 'fuel', fuel: 'power' },

  systems: [
    { id: 'power', name: 'Power', icon: 'lightning', primary: 'battery', tile: ['battery', 'output'],
      channels: [
        { id: 'output', label: 'Output', unit: 'kW', min: 0, max: 120, dec: 0, init: 59, tau: 20 },
        { id: 'load', label: 'Load', unit: 'kW', min: 0, max: 140, dec: 0, init: 57, tau: 15 },
        { id: 'battery', label: 'Battery', unit: '%', min: 0, max: 100, dec: 0, init: 78, bands: { ok: [40, INF], caution: [25, INF], alert: [12, INF] }, meter: 'cell' },
      ],
      controls: [
        ctl.fader('throttle', 'Generator throttle', { ui: 'knob', def: 60, lag: 45, hint: 'Sets generator output. Raise if load exceeds output.' }),
        ctl.toggle('shedLabs', 'Shed lab equipment', { ui: 'guarded', hint: 'Saves 8 kW. Labs keep sensors calibrated, so drift grows while shed.' }),
        ctl.toggle('shedComms', 'Shed aux comms', { ui: 'lever', hint: 'Saves 4 kW. Reduces signal strength.' }),
        maint,
      ],
      links: [['fuel', 'level'], ['air', 'scrubOut'], ['hull', 'bilge']] },
    { id: 'air', name: 'Air', icon: 'wind', primary: 'co2', tile: ['co2', 'o2'],
      channels: [
        { id: 'o2', label: 'Oxygen', unit: '%', min: 14, max: 25, dec: 1, init: 21, tau: 60, bands: { ok: [19.5, 22], caution: [18.5, 23], alert: [17, 24.5] } },
        { id: 'co2', label: 'CO2', unit: 'ppm', min: 300, max: 5000, dec: 0, init: 916, tau: 90, bands: { ok: [0, 1200], caution: [0, 2000], alert: [0, 3500] } },
        { id: 'pr', label: 'Pressure', unit: 'kPa', min: 80, max: 115, dec: 1, init: 101.3, tau: 25, bands: { ok: [99, 103.5], caution: [96, 106], alert: [92, 110] }, meter: 'dial' },
        { id: 'scrubOut', label: 'Scrubber output', unit: '%', min: 0, max: 100, dec: 0, init: 55, tau: 15 },
      ],
      controls: [
        ctl.fader('o2feed', 'O2 feed', { ui: 'vslider', ends: ['High', 'Low'], def: 50, lag: 40, hint: 'Oxygen supply rate.' }),
        ctl.fader('scrubber', 'CO2 scrubber rate', { def: 55, lag: 60, hint: 'Removes CO2. Needs power and filters.' }),
        maint,
      ],
      links: [['power', 'battery'], ['consumables', 'filters'], ['waste', 'tank'], ['hull', 'leak']] },
    { id: 'hull', name: 'Hull', icon: 'shield', primary: 'integrity', tile: ['integrity', 'leak'],
      channels: [
        { id: 'integrity', label: 'Integrity', unit: '%', min: 0, max: 100, dec: 0, init: 96, bands: { ok: [70, INF], caution: [50, INF], alert: [30, INF] }, meter: 'shield' },
        { id: 'stress', label: 'Stress', unit: '%', min: 0, max: 120, dec: 0, init: 28, tau: 20, bands: { ok: [0, 60], caution: [0, 75], alert: [0, 90] }, meter: 'dial' },
        { id: 'leak', label: 'Leak rate', unit: 'L/min', min: 0, max: 20, dec: 1, init: 0, tau: 10, bands: { ok: [0, 0.5], caution: [0, 2], alert: [0, 5] } },
        { id: 'bilge', label: 'Bilge level', unit: '%', min: 0, max: 100, dec: 0, init: 1, bands: { ok: [0, 25], caution: [0, 50], alert: [0, 75] }, meter: 'tank' },
      ],
      controls: [
        ctl.job('patch', 'Dispatch patch crew', { dur: 90, cd: 120, hint: 'Crew travels, then seals leaks and repairs some damage. Slower on short rations.' }),
        ctl.fader('pump', 'Bilge pump', { ui: 'steps', stops: [{ v: 0, label: 'Off' }, { v: 20, label: 'Low' }, { v: 50, label: 'Medium' }, { v: 100, label: 'High' }], def: 20, lag: 30, hint: 'Drains the bilge. Uses power.' }),
        maint,
      ],
      links: [['air', 'pr'], ['ballast', 'depth'], ['power', 'load']] },
    { id: 'ballast', name: 'Ballast', icon: 'anchor', primary: 'depth', tile: ['depth', 'trim'],
      channels: [
        { id: 'depth', label: 'Depth', unit: 'm', min: 300, max: 700, dec: 0, init: 500, bands: { ok: [470, 530], caution: [430, 570], alert: [380, 620] }, meter: 'ruler', flip: true },
        { id: 'trim', label: 'Buoyancy trim', unit: '%', min: -40, max: 40, dec: 1, init: 0, tau: 25, bands: { ok: [-6, 6], caution: [-12, 12], alert: [-20, 20] }, meter: 'dial' },
      ],
      controls: [
        ctl.fader('tanks', 'Fill / vent tanks', { ui: 'vslider', ends: ['Vent (rise)', 'Fill (sink)'], mid: 'Neutral', def: 50, lag: 100, unit: '', hint: 'Below 50 fills tanks (sink). Above 50 vents (rise). 50 is neutral.' }),
        maint,
      ],
      links: [['hull', 'stress'], ['power', 'battery'], ['comms', 'sig']] },
    { id: 'water', name: 'Water', icon: 'drop', primary: 'level', tile: ['level', 'sal'],
      channels: [
        { id: 'level', label: 'Potable level', unit: '%', min: 0, max: 100, dec: 0, init: 70, bands: { ok: [35, INF], caution: [20, INF], alert: [10, INF] }, meter: 'drop' },
        { id: 'sal', label: 'Salinity', unit: 'ppm', min: 0, max: 1000, dec: 0, init: 220, tau: 40, bands: { ok: [0, 350], caution: [0, 500], alert: [0, 700] } },
        { id: 'flow', label: 'Flow', unit: 'L/min', min: 0, max: 100, dec: 0, init: 40, tau: 30 },
      ],
      controls: [
        ctl.fader('desal', 'Desalinator rate', { ui: 'knob', def: 50, lag: 90, hint: 'Pushing hard makes more water but raises salinity.' }),
        maint,
      ],
      links: [['power', 'battery'], ['waste', 'tank'], ['consumables', 'food']] },
    { id: 'comms', name: 'Comms', icon: 'broadcast', primary: 'sig', tile: ['sig', 'link'],
      channels: [
        { id: 'sig', label: 'Signal strength', unit: '%', min: 0, max: 100, dec: 0, init: 68, tau: 15, bands: { ok: [55, INF], caution: [40, INF], alert: [25, INF] }, meter: 'signal' },
        { id: 'link', label: 'Link status', unit: '', min: 0, max: 2, dec: 0, init: 2, text: ['Down', 'Degraded', 'Up'], derived: true },
      ],
      controls: [
        ctl.fader('gain', 'Antenna gain', { def: 60, lag: 25, hint: 'Higher gain, stronger signal, more power.' }),
        ctl.job('buoy', 'Deploy buoy', { dur: 150, cd: 300, cost: { spares: 1 }, hint: 'Boosts signal for about 10 minutes. Uses 1 spare.' }),
        maint,
      ],
      links: [['power', 'battery'], ['ballast', 'depth']] },
    { id: 'airlock', name: 'Airlock', icon: 'door', primary: 'seal', tile: ['seal', 'dp'],
      channels: [
        { id: 'seal', label: 'Seal integrity', unit: '%', min: 0, max: 100, dec: 0, init: 92, bands: { ok: [75, INF], caution: [55, INF], alert: [35, INF] }, meter: 'ring' },
        { id: 'dp', label: 'Pressure difference', unit: 'kPa', min: -15, max: 15, dec: 1, init: 0, tau: 30, bands: { ok: [-1.5, 1.5], caution: [-3, 3], alert: [-6, 6] }, meter: 'dial' },
        { id: 'cycle', label: 'Cycle state', unit: '', min: 0, max: 2, dec: 0, init: 0, text: ['Idle', 'Cycling', 'Equalizing'], derived: true },
      ],
      controls: [
        ctl.job('cycle', 'Cycle airlock', { ui: 'arm', dur: 40, cd: 60, hint: 'Reseats the gasket (+5 seal) but spikes pressure difference. Equalize afterwards.' }),
        ctl.job('equalize', 'Equalize', { dur: 30, cd: 30, hint: 'Brings the lock to station pressure.' }),
        maint,
      ],
      links: [['hull', 'integrity'], ['air', 'pr']] },
    { id: 'waste', name: 'Waste', icon: 'recycle', primary: 'tank', tile: ['tank', 'rate'],
      channels: [
        { id: 'tank', label: 'Tank level', unit: '%', min: 0, max: 100, dec: 0, init: 35, bands: { ok: [0, 60], caution: [0, 75], alert: [0, 90] }, meter: 'porthole' },
        { id: 'rate', label: 'Processing rate', unit: '%', min: 0, max: 100, dec: 0, init: 50, tau: 10 },
      ],
      controls: [
        ctl.fader('processor', 'Processor rate', { ui: 'steps', stops: [{ v: 0, label: 'Idle' }, { v: 25, label: 'Low' }, { v: 50, label: 'Normal' }, { v: 75, label: 'High' }, { v: 100, label: 'Max' }], def: 50, lag: 60, hint: 'Processes waste. Uses power.' }),
        ctl.toggle('vent', 'Emergency vent', { ui: 'guarded', lag: 25, hint: 'Dumps waste fast but lowers cabin pressure.' }),
        maint,
      ],
      links: [['power', 'battery'], ['water', 'sal'], ['air', 'co2']] },
    { id: 'consumables', name: 'Supplies', icon: 'package', primary: 'food', tile: ['food', 'filters'],
      channels: [
        { id: 'food', label: 'Food', unit: 'units', min: 0, max: 100, dec: 0, init: 60, bands: { ok: [30, INF], caution: [15, INF], alert: [6, INF] }, meter: 'crates' },
        { id: 'filters', label: 'Filters', unit: 'units', min: 0, max: 20, dec: 0, init: 10, bands: { ok: [6, INF], caution: [3, INF], alert: [1, INF] }, meter: 'cell' },
        { id: 'spares', label: 'Spares', unit: 'units', min: 0, max: 12, dec: 0, init: 6, bands: { ok: [4, INF], caution: [2, INF], alert: [1, INF] }, meter: 'ring' },
      ],
      controls: [
        ctl.job('orderFood', 'Order food', { order: 'food', ...ORDER }),
        ctl.job('orderFilters', 'Order filters', { order: 'filters', ...ORDER }),
        ctl.job('orderSpares', 'Order spares', { order: 'spares', ...ORDER }),
        ctl.job('orderFuel', 'Order fuel', { order: 'fuel', ...ORDER }),
        ctl.fader('ration', 'Ration level', { ui: 'steps', stops: [{ v: 50, label: 'Strict' }, { v: 75, label: 'Lean' }, { v: 100, label: 'Full' }], min: 50, max: 100, step: 5, def: 100, lag: 30, hint: 'Lower rations stretch food and water, but slow the patch crew.' }),
      ],
      links: [['fuel', 'level'], ['air', 'co2'], ['water', 'level']] },
    { id: 'fuel', name: 'Fuel', icon: 'gas-pump', primary: 'level', tile: ['level', 'burn'],
      channels: [
        { id: 'level', label: 'Tank level', unit: '%', min: 0, max: 100, dec: 0, init: 85, bands: { ok: [35, INF], caution: [20, INF], alert: [10, INF] }, meter: 'tank' },
        { id: 'burn', label: 'Burn rate', unit: '%/min', min: 0, max: 5, dec: 2, init: 1.24, tau: 20 },
      ],
      controls: [
        ctl.fader('valve', 'Fuel valve', { ui: 'knob', skin: 'valve', def: 70, lag: 50, hint: 'Below about 50% the generator is starved of fuel.' }),
      ],
      links: [['power', 'output'], ['consumables', 'food']] },
    { id: 'instruments', name: 'Instruments', icon: 'gauge', primary: 'health', tile: ['health', 'calerr'],
      channels: [
        { id: 'health', label: 'Worst sensor health', unit: '%', min: 0, max: 100, dec: 0, init: 100, bands: { ok: [60, INF], caution: [40, INF], alert: [20, INF] }, meter: 'dial' },
        { id: 'calerr', label: 'Worst calibration error', unit: '%', min: 0, max: 100, dec: 1, init: 0, bands: { ok: [0, 10], caution: [0, 25], alert: [0, 100] } },
      ],
      controls: [maint],
      links: [['power', 'battery'], ['consumables', 'spares']] },
  ],
};

// Systems whose gauges can be wrong (everything except Instruments, which reports its own self-test).
export const SENSOR_SYSTEMS = CONFIG.systems.filter((s) => s.id !== 'instruments').map((s) => s.id);
export const SYSTEM_BY_ID = Object.fromEntries(CONFIG.systems.map((s) => [s.id, s]));
/** Only systems you can service wear out: no Maintenance control means no wear (nothing the player could do about it). */
export const hasWear = (sd) => sd.controls.some((c) => c.id === 'maint');
export const channelOf = (sysId, chId) => SYSTEM_BY_ID[sysId].channels.find((c) => c.id === chId);
