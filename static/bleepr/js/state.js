// Project state, note editing rules, undo/redo, and localStorage.

export const STEPS_PER_MEASURE = 32;      // 32nd-note steps in one 4/4 measure
export const MIN_PITCH = 60;              // C4
export const MAX_PITCH = 107;             // B7
export const MAX_LAYERS = 6;
export const MAX_SECONDS = 30;
export const NAME_MAX = 10;
export const BPM_MIN = 20;
export const BPM_MAX = 300;
export const MEASURES_MIN = 1;
export const MEASURES_MAX = 8;
export const UNDO_LIMIT = 50;
// Allowed lengths in steps: 1, 1/2, 1/4, 1/8, 1/16, 1/32 and dotted versions
// (dotted 1/32 is 1.5 steps, so it is left out).
export const ALLOWED_LENGTHS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];

const KEY_CURRENT = 'bleepr.current.v1';
const KEY_TUNES = 'bleepr.tunes.v1';

// ---------- storage (never throws) ----------
export const storage = {
  get(key) {
    try { const v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); }
    catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
};

// ---------- helpers ----------
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const loopSeconds = (measures, bpm) => (measures * 4 * 60) / bpm;
export const fitsLimit = (measures, bpm) => loopSeconds(measures, bpm) <= MAX_SECONDS + 1e-9;
export const minBpmFor = (measures) => Math.max(BPM_MIN, Math.ceil((measures * 240) / MAX_SECONDS));
export const maxMeasuresFor = (bpm) => clamp(Math.floor((bpm * MAX_SECONDS) / 240), MEASURES_MIN, MEASURES_MAX);
export const totalSteps = (p) => p.measures * STEPS_PER_MEASURE;

export function fitLength(n) {
  let best = 0;
  for (const l of ALLOWED_LENGTHS) if (l <= n) best = l;
  return best;
}

export function nearestLength(n) {
  let best = ALLOWED_LENGTHS[0];
  for (const l of ALLOWED_LENGTHS) if (Math.abs(l - n) <= Math.abs(best - n)) best = l;
  return best;
}

export function cleanName(s, fallback = 'My Tune') {
  const v = String(s ?? '').replace(/[\r\n|~]/g, ' ').trim().slice(0, NAME_MAX);
  return v || fallback;
}

let idCounter = 0;
export const newId = (prefix = 'L') =>
  prefix + Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 5);

function freeColor(layers) {
  for (let c = 1; c <= MAX_LAYERS; c++) if (!layers.some((l) => l.color === c)) return c;
  return 1;
}

export function createLayer(presetId = 'Brickphone', layers = [], name) {
  const color = freeColor(layers);
  return {
    id: newId('L'),
    name: cleanName(name, `Layer ${color}`),
    presetId,
    params: { grit: 0.5, bright: 0.5 },
    mute: false,
    solo: false,
    volume: 0.8,
    color,
    notes: [],
  };
}

export function createProject() {
  const layer = createLayer('Brickphone', []);
  return { name: 'My Tune', bpm: 120, measures: 4, layers: [layer], activeLayerId: layer.id };
}

// Validate anything loaded from storage or a share string.
export function normalizeProject(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const out = {
    name: cleanName(p.name),
    bpm: clamp(Math.round(Number(p.bpm) || 120), BPM_MIN, BPM_MAX),
    measures: clamp(Math.round(Number(p.measures) || 4), MEASURES_MIN, MEASURES_MAX),
    layers: [],
    activeLayerId: null,
  };
  if (!fitsLimit(out.measures, out.bpm)) out.measures = maxMeasuresFor(out.bpm);
  const total = out.measures * STEPS_PER_MEASURE;
  const layers = Array.isArray(p.layers) ? p.layers.slice(0, MAX_LAYERS) : [];
  for (const l of layers) {
    const layer = createLayer(String(l.presetId || 'Brickphone'), out.layers, l.name);
    if (l.id) layer.id = String(l.id);
    if (Number.isInteger(l.color) && l.color >= 1 && l.color <= MAX_LAYERS && !out.layers.some((x) => x.color === l.color)) layer.color = l.color;
    layer.params = {
      grit: clamp(Number(l.params?.grit ?? 0.5), 0, 1),
      bright: clamp(Number(l.params?.bright ?? 0.5), 0, 1),
    };
    layer.mute = !!l.mute;
    layer.solo = !!l.solo;
    layer.volume = clamp(Number(l.volume ?? 0.8), 0, 1);
    const notes = Array.isArray(l.notes) ? l.notes : [];
    layer.notes = insertNotes([], notes.map((n) => ({
      start: Math.round(Number(n.start)),
      length: Math.round(Number(n.length)),
      pitch: Math.round(Number(n.pitch)),
    })).filter((n) => Number.isFinite(n.start) && Number.isFinite(n.length) && Number.isFinite(n.pitch)), total);
    out.layers.push(layer);
  }
  if (!out.layers.length) out.layers.push(createLayer('Brickphone', []));
  out.activeLayerId = out.layers.some((l) => l.id === p.activeLayerId) ? p.activeLayerId : out.layers[0].id;
  return out;
}

// ---------- note rules ----------
// Fit a note inside the loop and pitch range. Returns null if nothing is left.
export function clipNote(n, total) {
  const pitch = clamp(n.pitch, MIN_PITCH, MAX_PITCH);
  const start = Math.max(0, n.start);
  if (start >= total) return null;
  const length = fitLength(Math.min(n.length, total - start));
  if (!length) return null;
  return { start, length, pitch };
}

// Place one note into a monophonic layer. Notes it covers are trimmed
// (if they start earlier) or replaced (if they start inside it).
function placeNote(notes, n) {
  const end = n.start + n.length;
  const out = [];
  for (const e of notes) {
    const eEnd = e.start + e.length;
    if (eEnd <= n.start || e.start >= end) { out.push(e); continue; }
    if (e.start < n.start) {
      const len = fitLength(n.start - e.start);
      if (len) out.push({ ...e, length: len });
    }
    // else: replaced
  }
  out.push(n);
  return out;
}

export function insertNotes(existing, added, total) {
  let notes = existing.map((n) => ({ ...n }));
  const list = added.map((n) => clipNote(n, total)).filter(Boolean).sort((a, b) => a.start - b.start);
  for (const n of list) notes = placeNote(notes, n);
  return notes.sort((a, b) => a.start - b.start);
}

// Cut notes to a new loop length.
export function trimToTotal(notes, total) {
  return notes.map((n) => clipNote(n, total)).filter(Boolean);
}

export function audible(layer, layers) {
  const anySolo = layers.some((l) => l.solo);
  return anySolo ? layer.solo : !layer.mute;
}

export function isEmptyProject(p) {
  return p.layers.every((l) => l.notes.length === 0);
}

// ---------- store ----------
class Store {
  constructor() {
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = null;
    this.lastTime = 0;
    this.saveTimer = 0;
    const saved = storage.get(KEY_CURRENT);
    if (saved && saved.project) {
      this.project = normalizeProject(saved.project);
      this.dirty = !!saved.dirty;
      this.savedId = saved.savedId || null;
    } else {
      this.project = createProject();
      this.dirty = false;
      this.savedId = null;
    }
  }

  get activeLayer() {
    const p = this.project;
    return p.layers.find((l) => l.id === p.activeLayerId) || p.layers[0];
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(reason) {
    for (const fn of this.listeners) fn(reason, this.project);
  }

  snapshot() { return JSON.stringify(this.project); }

  // mutator edits this.project in place.
  // history: add an undo step. coalesce: a key; repeated edits with the
  // same key within 1 s share one undo step (sliders, steppers).
  update(mutator, { history = true, coalesce = null, reason = 'edit', dirty = true } = {}) {
    if (history) {
      const now = performance.now();
      const merge = coalesce && coalesce === this.lastCoalesce && now - this.lastTime < 1000;
      if (!merge) {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      }
      this.redoStack = [];
      this.lastCoalesce = coalesce;
      this.lastTime = now;
    }
    mutator(this.project);
    if (dirty) this.dirty = true;
    this.persist();
    this.emit(reason);
  }

  // Swap in a whole project (open, import, new).
  replace(project, { history = true, dirty = false, savedId = null } = {}) {
    if (history) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastCoalesce = null;
    this.project = normalizeProject(project);
    this.dirty = dirty;
    this.savedId = savedId;
    this.persist(true);
    this.emit('replace');
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  // Mixer settings (mute, solo, volume) are not part of undo history,
  // so keep the current values when stepping back or forward.
  restore(json) {
    const next = normalizeProject(JSON.parse(json));
    for (const l of next.layers) {
      const cur = this.project.layers.find((x) => x.id === l.id);
      if (cur) { l.mute = cur.mute; l.solo = cur.solo; l.volume = cur.volume; }
    }
    this.project = next;
    this.lastCoalesce = null;
    this.dirty = true;
    this.persist();
    this.emit('history');
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  persist(now = false) {
    clearTimeout(this.saveTimer);
    const write = () => storage.set(KEY_CURRENT, { project: this.project, dirty: this.dirty, savedId: this.savedId });
    if (now) write(); else this.saveTimer = setTimeout(write, 400);
  }

  // ----- My tunes -----
  listTunes() {
    const t = storage.get(KEY_TUNES);
    return Array.isArray(t) ? t : [];
  }

  writeTunes(list) { return storage.set(KEY_TUNES, list); }

  saveCurrent() {
    const list = this.listTunes();
    const entry = { id: this.savedId, name: this.project.name, savedAt: Date.now(), project: JSON.parse(this.snapshot()) };
    const i = entry.id ? list.findIndex((t) => t.id === entry.id) : -1;
    if (i >= 0) list[i] = entry;
    else { entry.id = newId('T'); list.unshift(entry); }
    if (!this.writeTunes(list)) return false;
    this.savedId = entry.id;
    this.dirty = false;
    this.persist(true);
    this.emit('saved');
    return true;
  }

  openTune(id) {
    const t = this.listTunes().find((x) => x.id === id);
    if (!t) return false;
    this.replace(t.project, { history: true, dirty: false, savedId: t.id });
    return true;
  }

  renameTune(id, name) {
    const list = this.listTunes();
    const t = list.find((x) => x.id === id);
    if (!t) return;
    t.name = cleanName(name);
    t.project.name = t.name;
    this.writeTunes(list);
    if (this.savedId === id) this.update((p) => { p.name = t.name; }, { history: false, dirty: false, reason: 'rename' });
  }

  deleteTune(id) {
    this.writeTunes(this.listTunes().filter((t) => t.id !== id));
    if (this.savedId === id) { this.savedId = null; this.dirty = true; this.persist(true); this.emit('saved'); }
  }
}

export const store = new Store();
