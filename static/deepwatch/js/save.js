// localStorage persistence. Global settings (theme, audio, best scores, walkthrough flag) outlive any run.
import { CONFIG } from './config.js';
import { serializeSim, restoreSim } from './sim.js';

const RUN_KEY = 'deepwatch.run';
const GLOBAL_KEY = 'deepwatch.global';

const defaults = () => ({ best: { quiet: 0, standard: 0, rough: 0 }, audio: { volume: 0.6, muted: false }, tutorialSeen: false });

function read(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

export function loadGlobal() {
  const g = read(GLOBAL_KEY) || {};
  const d = defaults();
  return { ...d, ...g, best: { ...d.best, ...(g.best || {}) }, audio: { ...d.audio, ...(g.audio || {}) } };
}
export function saveGlobal(patch) {
  const g = { ...loadGlobal(), ...patch };
  write(GLOBAL_KEY, g);
  return g;
}

export function saveRun(sim) {
  if (!sim || sim.over) return false;
  return write(RUN_KEY, { saveVersion: CONFIG.saveVersion, savedAt: Date.now(), sim: serializeSim(sim) });
}
export function hasRun() {
  const r = read(RUN_KEY);
  return !!(r && r.saveVersion === CONFIG.saveVersion && r.sim && r.sim.version === CONFIG.saveVersion);
}
/** Returns a restored sim, or null. Incompatible saves are discarded quietly. */
export function loadRun() {
  const r = read(RUN_KEY);
  if (!r || r.saveVersion !== CONFIG.saveVersion) { if (r) deleteRun(); return null; }
  try {
    const sim = restoreSim(r.sim);
    if (!sim) { deleteRun(); return null; }
    return sim;
  } catch { deleteRun(); return null; }
}
export function deleteRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }

export function recordScore(difficulty, days) {
  const g = loadGlobal();
  const rounded = Math.round(days * 10) / 10;
  const isBest = rounded > (g.best[difficulty] || 0);
  if (isBest) saveGlobal({ best: { ...g.best, [difficulty]: rounded } });
  return { score: rounded, best: Math.max(rounded, g.best[difficulty] || 0), isBest };
}
