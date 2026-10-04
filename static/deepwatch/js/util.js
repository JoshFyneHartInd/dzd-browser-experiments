// Small shared helpers. No DOM. Seeded RNG state lives on the sim object so saves resume deterministically.

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Move `cur` toward `target` with first-order lag (time constant `tau` seconds). */
export function relax(cur, target, tau, dt) {
  if (tau <= 0) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

// mulberry32 on sim.rng (a 32-bit int)
export function rand(sim) {
  sim.rng = (sim.rng + 0x6d2b79f5) | 0;
  let t = sim.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (sim, a, b) => a + (b - a) * rand(sim);
export function gauss(sim) {
  let u = 0;
  while (u === 0) u = rand(sim);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand(sim));
}
export const pick = (sim, arr) => arr[Math.floor(rand(sim) * arr.length) % arr.length];
export function weightedPick(sim, items) {
  // items: [{item, w}]
  const total = items.reduce((s, i) => s + i.w, 0);
  if (total <= 0) return null;
  let r = rand(sim) * total;
  for (const i of items) {
    r -= i.w;
    if (r <= 0) return i.item;
  }
  return items[items.length - 1].item;
}

/** Ornstein-Uhlenbeck step: mean-reverting random walk with stationary sd `sd` and time constant `tau`. */
export function ouStep(sim, x, sd, tau, dt, mult = 1) {
  const s = sd * mult;
  return x + (-x / tau) * dt + s * Math.sqrt((2 * dt) / tau) * gauss(sim);
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Game clock from real seconds elapsed. Returns {day (1-based), hh, mm}. */
export function gameClock(realSec, gameSecPerRealSec = 24) {
  const gs = realSec * gameSecPerRealSec;
  const day = Math.floor(gs / 86400) + 1;
  const rem = gs % 86400;
  return { day, hh: Math.floor(rem / 3600), mm: Math.floor((rem % 3600) / 60) };
}
