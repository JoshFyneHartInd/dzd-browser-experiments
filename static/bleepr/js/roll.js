// Piano roll editor on a canvas.
// One model, two orientations:
//   landscape: keyboard on the left, time runs left to right
//   portrait:  keyboard along the bottom, time runs top to bottom

import {
  store, STEPS_PER_MEASURE, MIN_PITCH, MAX_PITCH, clamp,
  insertNotes, nearestLength, fitLength, totalSteps,
} from './state.js';
import { noteName } from './rtttl.js';

const ROWS = MAX_PITCH - MIN_PITCH + 1;
const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (p) => BLACK.has(p % 12);
const ZOOM_MIN = 2;
const ZOOM_MAX = 64;
const TAP_SLOP = 6; // px of movement before a tap becomes a drag

export class Roll {
  constructor(canvas, { engine, onSelection = () => {}, onStatus = () => {} }) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.engine = engine;
    this.onSelection = onSelection;
    this.onStatus = onStatus;
    this.tool = 'draw';
    this.snap = 2;
    this.selection = new Set(); // note start steps in the active layer (unique per layer)
    this.draft = null;          // working copy of active notes during a drag
    this.stepPx = null;
    this.rowPx = 16;
    this.scrollT = 0;
    this.scrollP = null;
    this.portrait = false;
    this.W = 0; this.H = 0; this.dpr = 1;
    this.pointers = new Map();
    this.g = null;              // current gesture
    this.heldKey = null;
    this.cursor = { t: 0, pitch: 72 };
    this.showCursor = false;
    this.playhead = null;
    this.marquee = null;
    this.frame = 0;
    this.colors = {};
    this.mq = window.matchMedia('(max-width: 767px)');

    this.readColors();
    document.addEventListener('themechange', () => { this.readColors(); this.redraw(); });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.mq.addEventListener('change', () => this.resize());

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('lostpointercapture', (e) => { if (this.pointers.has(e.pointerId)) this.onUp(e, true); });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('keydown', (e) => this.onKey(e));
    canvas.addEventListener('focus', () => { this.showCursor = canvas.matches(':focus-visible'); this.redraw(); });
    canvas.addEventListener('blur', () => { this.showCursor = false; this.redraw(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    store.subscribe((reason) => {
      if (reason === 'replace' || reason === 'layer-select') this.selection.clear();
      else this.pruneSelection();
      this.clampScroll();
      this.redraw();
    });
  }

  // ---------- setup ----------
  readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const names = ['bg', 'surface', 'surface-2', 'border', 'fg', 'fg-muted', 'accent', 'accent-fg', 'note', 'note-selected', 'key-white', 'key-black'];
    for (const n of names) this.colors[n] = v('--' + n);
    for (let i = 1; i <= 6; i++) this.colors['layer-' + i] = v('--layer-' + i);
    this.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }

  resize() {
    const parent = this.canvas.parentElement;
    const W = Math.max(1, parent.clientWidth), H = Math.max(1, parent.clientHeight);
    const portrait = this.mq.matches;
    const changed = portrait !== this.portrait;
    // keep the view centered on the same place when the layout flips
    let centerT = null, centerP = null;
    if (this.stepPx && this.W) {
      centerT = (this.scrollT + this.timeExtent / 2) / this.stepPx;
      centerP = this.centerPitch();
    }
    this.W = W; this.H = H;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.portrait = portrait;
    this.layout();
    if (this.stepPx == null || changed) this.fitZoom();
    if (this.scrollP == null) this.scrollToPitch(84);
    else if (centerP != null) this.scrollToPitch(centerP);
    if (centerT != null && changed) this.scrollT = centerT * this.stepPx - this.timeExtent / 2;
    this.clampScroll();
    this.draw();
  }

  layout() {
    const { W, H } = this;
    this.keySize = 60;
    this.rulerSize = this.portrait ? 30 : 26;
    if (this.portrait) this.grid = { x: this.rulerSize, y: 0, w: W - this.rulerSize, h: H - this.keySize };
    else this.grid = { x: this.keySize, y: this.rulerSize, w: W - this.keySize, h: H - this.rulerSize };
    this.timeExtent = Math.max(1, this.portrait ? this.grid.h : this.grid.w);
    this.pitchExtent = Math.max(1, this.portrait ? this.grid.w : this.grid.h);
    this.rowPx = clamp(this.pitchExtent / 24, 14, 34); // about two octaves
  }

  fitZoom() {
    const m = store.project.measures;
    const fit = this.portrait ? 1 : Math.min(m, 4);
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.stepPx = clamp(this.timeExtent / (fit * STEPS_PER_MEASURE), coarse ? 8 : 5, 40);
  }

  centerPitch() {
    const mid = (this.scrollP + this.pitchExtent / 2) / this.rowPx;
    return this.portrait ? MIN_PITCH + mid : MAX_PITCH + 1 - mid;
  }

  scrollToPitch(p) {
    const row = this.portrait ? p - MIN_PITCH : MAX_PITCH + 1 - p;
    this.scrollP = row * this.rowPx - this.pitchExtent / 2;
    this.clampScroll();
  }

  clampScroll() {
    if (!this.stepPx) return;
    const total = totalSteps(store.project);
    this.scrollT = clamp(this.scrollT, 0, Math.max(0, total * this.stepPx - this.timeExtent + 2));
    this.scrollP = clamp(this.scrollP ?? 0, 0, Math.max(0, ROWS * this.rowPx - this.pitchExtent));
  }

  setTool(t) {
    this.tool = t;
    if (t !== 'select' && this.selection.size) this.setSelection(new Set());
    this.updateCursor();
    this.redraw();
  }
  setSnap(s) { this.snap = s; this.redraw(); }

  setPlayhead(step) {
    this.playhead = step;
    if (step != null && !this.g) {
      const pos = step * this.stepPx;
      if (pos < this.scrollT || pos > this.scrollT + this.timeExtent - 16) {
        this.scrollT = pos - this.timeExtent * 0.08;
        this.clampScroll();
      }
    }
    this.redraw();
  }

  // ---------- model helpers ----------
  activeLayer() { return store.activeLayer; }
  activeNotes() { return this.draft || this.activeLayer().notes; }

  pruneSelection() {
    const starts = new Set(this.activeLayer().notes.map((n) => n.start));
    let changed = false;
    for (const s of this.selection) if (!starts.has(s)) { this.selection.delete(s); changed = true; }
    if (changed) this.onSelection(this.selection.size);
  }

  setSelection(set) {
    this.selection = set;
    this.onSelection(set.size);
    this.redraw();
  }

  commit(notes, reason = 'notes') {
    const layer = this.activeLayer();
    const same = JSON.stringify(notes) === JSON.stringify(layer.notes);
    this.draft = null;
    if (same) { this.redraw(); return; }
    const id = layer.id;
    store.update((p) => { p.layers.find((l) => l.id === id).notes = notes; }, { reason });
  }

  deleteSelection() {
    if (!this.selection.size) return false;
    const keep = this.activeLayer().notes.filter((n) => !this.selection.has(n.start));
    this.selection = new Set();
    this.onSelection(0);
    this.commit(keep);
    return true;
  }

  preview(pitch, dur = 0.25) {
    this.engine.previewNote(this.activeLayer(), pitch, dur);
  }

  // ---------- geometry ----------
  tPos(t) { return (this.portrait ? this.grid.y : this.grid.x) + t * this.stepPx - this.scrollT; }
  pPos(pitch) {
    return this.portrait
      ? this.grid.x + (pitch - MIN_PITCH) * this.rowPx - this.scrollP
      : this.grid.y + (MAX_PITCH - pitch) * this.rowPx - this.scrollP;
  }
  rect(t, len, pitch) {
    const a = this.tPos(t), b = this.tPos(t + len), q = this.pPos(pitch);
    return this.portrait ? { x: q, y: a, w: this.rowPx, h: b - a } : { x: a, y: q, w: b - a, h: this.rowPx };
  }
  toModel(x, y) {
    const tc = this.portrait ? y - this.grid.y : x - this.grid.x;
    const pc = this.portrait ? x - this.grid.x : y - this.grid.y;
    const t = (tc + this.scrollT) / this.stepPx;
    const row = Math.floor((pc + this.scrollP) / this.rowPx);
    const pitch = this.portrait ? MIN_PITCH + row : MAX_PITCH - row;
    return { t, pitch: clamp(pitch, MIN_PITCH, MAX_PITCH) };
  }
  region(x, y) {
    const { keySize: k, rulerSize: r, W, H } = this;
    if (this.portrait) {
      if (y >= H - k) return x >= r ? 'keys' : 'corner';
      return x < r ? 'ruler' : 'grid';
    }
    if (x < k) return y >= r ? 'keys' : 'corner';
    return y < r ? 'ruler' : 'grid';
  }
  local(e) {
    const b = this.canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  // time-axis and pitch-axis components of a screen vector
  axes(dx, dy) { return this.portrait ? { dt: dy, dp: dx } : { dt: dx, dp: dy }; }

  noteAt(t, pitch, notes = this.activeNotes()) {
    return notes.find((n) => n.pitch === pitch && t >= n.start && t < n.start + n.length) || null;
  }

  isEdge(n, x, y) {
    const r = this.rect(n.start, n.length, n.pitch);
    const len = this.portrait ? r.h : r.w;
    const end = this.portrait ? r.y + r.h : r.x + r.w;
    const pos = this.portrait ? y : x;
    const zone = Math.max(6, Math.min(14, len * 0.35));
    return len >= 10 && end - pos <= zone;
  }

  snapFloor(t) { return Math.floor(t / this.snap) * this.snap; }
  snapRound(t) { return Math.round(t / this.snap) * this.snap; }

  // ---------- pointer input ----------
  onDown(e) {
    if (e.button > 0) return;
    this.engine.ensure();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ }
    const pt = this.local(e);
    this.pointers.set(e.pointerId, pt);

    if (this.pointers.size === 2) {
      // second finger: cancel whatever the first one started, then pinch / pan
      this.draft = null;
      this.marquee = null;
      this.heldKey = null;
      const [a, b] = [...this.pointers.values()];
      this.g = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        stepPx: this.stepPx, scrollT: this.scrollT, scrollP: this.scrollP,
      };
      this.redraw();
      return;
    }
    if (this.pointers.size > 2) return;

    const region = this.region(pt.x, pt.y);
    const m = this.toModel(pt.x, pt.y);
    if (region === 'keys') {
      this.heldKey = m.pitch;
      this.preview(m.pitch, 0.35);
      this.g = { type: 'keys', start: pt, scrollP: this.scrollP, moved: false };
      this.redraw();
      return;
    }
    if (region === 'ruler' || region === 'corner') {
      this.g = { type: 'pan-time', start: pt, scrollT: this.scrollT };
      return;
    }
    this.gridDown(e, pt, m);
  }

  gridDown(e, pt, m) {
    const total = totalSteps(store.project);
    const notes = this.activeLayer().notes;
    const hit = this.noteAt(m.t, m.pitch, notes);
    const tool = this.tool;

    if (tool === 'erase') {
      this.g = { type: 'erase', start: pt };
      this.draft = notes.slice();
      this.eraseAt(m);
      return;
    }
    if (hit && this.isEdge(hit, pt.x, pt.y)) {
      if (tool === 'select' && !this.selection.has(hit.start)) this.setSelection(new Set([hit.start]));
      this.g = { type: 'resize', note: hit, orig: notes, start: pt };
      return;
    }
    if (hit) {
      let moving = [hit];
      if (tool === 'select') {
        if (e.shiftKey) {
          const next = new Set(this.selection);
          if (next.has(hit.start)) { next.delete(hit.start); this.setSelection(next); this.g = { type: 'none' }; return; }
          next.add(hit.start);
          this.setSelection(next);
        } else if (!this.selection.has(hit.start)) {
          this.setSelection(new Set([hit.start]));
        }
        moving = notes.filter((n) => this.selection.has(n.start));
      }
      this.g = { type: 'move', grab: hit, moving, orig: notes, down: m, start: pt, moved: false, lastPitch: hit.pitch, lastStart: hit.start };
      return;
    }
    if (tool === 'draw') {
      const start = this.snapFloor(m.t);
      if (start >= total || start < 0) return;
      const note = { start, length: fitLength(Math.min(this.snap, total - start)) || 1, pitch: m.pitch };
      this.g = { type: 'draw', note, orig: notes, start: pt };
      this.draft = insertNotes(notes, [note], total);
      this.preview(m.pitch);
      this.redraw();
      return;
    }
    // select tool on empty space: marquee
    this.g = { type: 'marquee', a: pt, b: pt, base: e.shiftKey ? new Set(this.selection) : new Set() };
    if (!e.shiftKey) this.setSelection(new Set());
  }

  onMove(e) {
    const pt = this.local(e);
    if (!this.pointers.has(e.pointerId)) { this.updateCursor(pt); return; }
    this.pointers.set(e.pointerId, pt);
    const g = this.g;
    if (!g) return;
    const total = totalSteps(store.project);

    switch (g.type) {
      case 'pinch': {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const newStep = clamp(g.stepPx * (dist / g.dist), ZOOM_MIN, ZOOM_MAX);
        const origin = this.portrait ? this.grid.y : this.grid.x;
        const m0 = this.axes(g.mid.x, g.mid.y), m1 = this.axes(mid.x, mid.y);
        const tAtMid = (m0.dt - origin + g.scrollT) / g.stepPx;
        this.stepPx = newStep;
        this.scrollT = tAtMid * newStep - (m1.dt - origin);
        this.scrollP = g.scrollP - (m1.dp - m0.dp);
        this.clampScroll();
        this.redraw();
        return;
      }
      case 'keys': {
        const d = this.axes(pt.x - g.start.x, pt.y - g.start.y);
        if (!g.moved && Math.abs(d.dp) > TAP_SLOP) { g.moved = true; this.heldKey = null; }
        if (g.moved) { this.scrollP = g.scrollP - d.dp; this.clampScroll(); this.redraw(); }
        return;
      }
      case 'pan-time': {
        const d = this.axes(pt.x - g.start.x, pt.y - g.start.y);
        this.scrollT = g.scrollT - d.dt;
        this.clampScroll();
        this.redraw();
        return;
      }
      case 'erase': this.eraseAt(this.toModel(pt.x, pt.y)); return;
      case 'marquee': {
        g.b = pt;
        this.marquee = { a: g.a, b: g.b };
        const m1 = this.toModel(g.a.x, g.a.y), m2 = this.toModel(pt.x, pt.y);
        const t0 = Math.min(m1.t, m2.t), t1 = Math.max(m1.t, m2.t);
        const p0 = Math.min(m1.pitch, m2.pitch), p1 = Math.max(m1.pitch, m2.pitch);
        const sel = new Set(g.base);
        for (const n of this.activeLayer().notes) {
          if (n.pitch >= p0 && n.pitch <= p1 && n.start < t1 && n.start + n.length > t0) sel.add(n.start);
        }
        this.setSelection(sel);
        return;
      }
      case 'draw':
      case 'resize': {
        const note = g.note;
        const m = this.toModel(pt.x, pt.y);
        let len = Math.max(1, this.snapRound(m.t) - note.start);
        if (g.type === 'draw') len = Math.max(len, Math.min(this.snap, total - note.start));
        len = nearestLength(len);
        if (note.start + len > total) len = fitLength(total - note.start);
        const others = g.orig.filter((n) => n !== note);
        this.draft = insertNotes(others, [{ ...note, length: len }], total);
        this.redraw();
        return;
      }
      case 'move': {
        if (!g.moved && Math.hypot(pt.x - g.start.x, pt.y - g.start.y) < TAP_SLOP) return;
        g.moved = true;
        const m = this.toModel(pt.x, pt.y);
        let delta = this.snapRound(g.grab.start + (m.t - g.down.t)) - g.grab.start;
        let dp = m.pitch - g.down.pitch;
        const minStart = Math.min(...g.moving.map((n) => n.start));
        const maxEnd = Math.max(...g.moving.map((n) => n.start + n.length));
        const minP = Math.min(...g.moving.map((n) => n.pitch));
        const maxP = Math.max(...g.moving.map((n) => n.pitch));
        delta = clamp(delta, -minStart, total - maxEnd);
        dp = clamp(dp, MIN_PITCH - minP, MAX_PITCH - maxP);
        const moved = g.moving.map((n) => ({ ...n, start: n.start + delta, pitch: n.pitch + dp }));
        const others = g.orig.filter((n) => !g.moving.includes(n));
        this.draft = insertNotes(others, moved, total);
        g.result = moved;
        const np = g.grab.pitch + dp;
        if (np !== g.lastPitch) { g.lastPitch = np; this.preview(np, 0.15); }
        this.redraw();
        return;
      }
      default:
    }
  }

  onUp(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.g;
    if (!g) return;
    if (g.type === 'pinch') {
      if (this.pointers.size === 0) this.g = null;
      return;
    }
    if (this.pointers.size > 0) return;
    this.g = null;
    this.heldKey = null;
    this.marquee = null;
    if (cancelled) { this.draft = null; this.redraw(); return; }

    switch (g.type) {
      case 'draw':
      case 'resize':
      case 'erase':
        if (this.draft) this.commit(this.draft);
        break;
      case 'move':
        if (g.moved && this.draft) {
          const draft = this.draft;
          if (this.tool === 'select') {
            this.selection = new Set(g.result.map((n) => n.start));
            this.onSelection(this.selection.size);
          }
          this.commit(draft);
        } else if (!g.moved && this.tool === 'draw') {
          // tap on a note with Draw removes it
          this.commit(g.orig.filter((n) => n !== g.grab));
        }
        break;
      default:
    }
    this.draft = null;
    this.redraw();
  }

  eraseAt(m) {
    const hit = this.noteAt(m.t, m.pitch, this.draft);
    if (hit) { this.draft = this.draft.filter((n) => n !== hit); this.redraw(); }
  }

  onWheel(e) {
    e.preventDefault();
    const pt = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      const origin = this.portrait ? this.grid.y : this.grid.x;
      const at = this.axes(pt.x, pt.y).dt - origin;
      const t = (at + this.scrollT) / this.stepPx;
      this.stepPx = clamp(this.stepPx * factor, ZOOM_MIN, ZOOM_MAX);
      this.scrollT = t * this.stepPx - at;
    } else {
      let dx = e.deltaX, dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      const d = this.axes(dx, dy);
      this.scrollT += d.dt;
      this.scrollP += d.dp;
    }
    this.clampScroll();
    this.redraw();
  }

  updateCursor(pt) {
    if (!pt) { this.canvas.style.cursor = ''; return; }
    const region = this.region(pt.x, pt.y);
    let cur = 'default';
    if (region === 'keys') cur = 'pointer';
    else if (region === 'ruler') cur = 'grab';
    else if (region === 'grid') {
      const m = this.toModel(pt.x, pt.y);
      const hit = this.noteAt(m.t, m.pitch);
      if (this.tool === 'erase') cur = hit ? 'pointer' : 'default';
      else if (hit && this.isEdge(hit, pt.x, pt.y)) cur = this.portrait ? 'ns-resize' : 'ew-resize';
      else if (hit) cur = 'move';
      else cur = this.tool === 'draw' ? 'crosshair' : 'default';
    }
    this.canvas.style.cursor = cur;
  }

  // ---------- keyboard editing ----------
  onKey(e) {
    const total = totalSteps(store.project);
    const c = this.cursor;
    const timeNext = this.portrait ? 'ArrowDown' : 'ArrowRight';
    const timePrev = this.portrait ? 'ArrowUp' : 'ArrowLeft';
    const pitchUp = this.portrait ? 'ArrowRight' : 'ArrowUp';
    const pitchDown = this.portrait ? 'ArrowLeft' : 'ArrowDown';
    let handled = true;
    if (e.key === timeNext) c.t = Math.min(total - this.snap, this.snapFloor(c.t) + this.snap);
    else if (e.key === timePrev) c.t = Math.max(0, this.snapFloor(c.t) - this.snap);
    else if (e.key === pitchUp) c.pitch = Math.min(MAX_PITCH, c.pitch + (e.shiftKey ? 12 : 1));
    else if (e.key === pitchDown) c.pitch = Math.max(MIN_PITCH, c.pitch - (e.shiftKey ? 12 : 1));
    else if (e.key === 'Enter') {
      const notes = this.activeLayer().notes;
      const hit = this.noteAt(c.t, c.pitch, notes);
      if (hit) this.commit(notes.filter((n) => n !== hit));
      else {
        this.commit(insertNotes(notes, [{ start: this.snapFloor(c.t), length: fitLength(this.snap) || 1, pitch: c.pitch }], total));
        this.preview(c.pitch);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!this.deleteSelection()) {
        const notes = this.activeLayer().notes;
        const hit = this.noteAt(c.t, c.pitch, notes);
        if (hit) this.commit(notes.filter((n) => n !== hit));
      }
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    this.showCursor = true;
    this.revealCursor();
    const hit = this.noteAt(c.t, c.pitch, this.activeLayer().notes);
    const bar = Math.floor(c.t / STEPS_PER_MEASURE) + 1;
    const beat = Math.floor((c.t % STEPS_PER_MEASURE) / 8) + 1;
    this.onStatus(`${noteName(c.pitch)}, bar ${bar} beat ${beat}${hit ? ', note' : ''}`);
    this.redraw();
  }

  revealCursor() {
    const c = this.cursor;
    const t0 = c.t * this.stepPx, t1 = (c.t + this.snap) * this.stepPx;
    if (t0 < this.scrollT) this.scrollT = t0 - 8;
    else if (t1 > this.scrollT + this.timeExtent) this.scrollT = t1 - this.timeExtent + 8;
    const row = this.portrait ? c.pitch - MIN_PITCH : MAX_PITCH - c.pitch;
    const p0 = row * this.rowPx, p1 = p0 + this.rowPx;
    if (p0 < this.scrollP) this.scrollP = p0;
    else if (p1 > this.scrollP + this.pitchExtent) this.scrollP = p1 - this.pitchExtent;
    this.clampScroll();
  }

  // ---------- drawing ----------
  redraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  draw() {
    if (!this.W || !this.stepPx) return;
    const c = this.c, col = this.colors, p = store.project;
    const { W, H, grid } = this;
    const total = totalSteps(p);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = col.surface;
    c.fillRect(0, 0, W, H);

    // visible ranges
    const tA = Math.max(0, Math.floor(this.scrollT / this.stepPx));
    const tB = Math.min(total, Math.ceil((this.scrollT + this.timeExtent) / this.stepPx));
    const rowA = Math.floor(this.scrollP / this.rowPx);
    const rowB = Math.min(ROWS - 1, Math.ceil((this.scrollP + this.pitchExtent) / this.rowPx));
    const pitchOfRow = (r) => (this.portrait ? MIN_PITCH + r : MAX_PITCH - r);
    const endPos = this.tPos(total);

    c.save();
    c.beginPath();
    c.rect(grid.x, grid.y, grid.w, grid.h);
    c.clip();

    // rows: shade black-key rows, lines between rows, stronger at octaves
    for (let r = rowA; r <= rowB; r++) {
      const pitch = pitchOfRow(r);
      const q = this.pPos(pitch);
      if (isBlack(pitch)) {
        c.globalAlpha = 0.4;
        c.fillStyle = col['surface-2'];
        if (this.portrait) c.fillRect(q, grid.y, this.rowPx, grid.h);
        else c.fillRect(grid.x, q, grid.w, this.rowPx);
        c.globalAlpha = 1;
      }
    }
    c.lineWidth = 1;
    for (let r = rowA; r <= rowB + 1; r++) {
      const pitch = pitchOfRow(r);
      // the boundary between B and C marks an octave
      const octave = this.portrait ? pitch % 12 === 0 : (pitch + 1) % 12 === 0;
      c.strokeStyle = col.border;
      c.globalAlpha = octave ? 1 : 0.35;
      const q = Math.round(this.portrait ? grid.x + r * this.rowPx - this.scrollP : grid.y + r * this.rowPx - this.scrollP) + 0.5;
      c.beginPath();
      if (this.portrait) { c.moveTo(q, grid.y); c.lineTo(q, grid.y + grid.h); }
      else { c.moveTo(grid.x, q); c.lineTo(grid.x + grid.w, q); }
      c.stroke();
    }

    // time lines: snap grid, beats, measures
    const subPx = this.snap * this.stepPx;
    for (let t = tA; t <= tB; t++) {
      let alpha = 0, width = 1, color = col.border;
      if (t % STEPS_PER_MEASURE === 0) { alpha = 1; color = col['fg-muted']; width = 1.5; }
      else if (t % 8 === 0) { alpha = 0.9; }
      else if (t % this.snap === 0 && subPx >= 6) { alpha = 0.35; }
      if (!alpha) continue;
      const a = Math.round(this.tPos(t)) + 0.5;
      c.globalAlpha = alpha;
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      if (this.portrait) { c.moveTo(grid.x, a); c.lineTo(grid.x + grid.w, a); }
      else { c.moveTo(a, grid.y); c.lineTo(a, grid.y + grid.h); }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.lineWidth = 1;

    // past the loop end
    if (this.portrait ? endPos < grid.y + grid.h : endPos < grid.x + grid.w) {
      c.fillStyle = col.bg;
      c.globalAlpha = 0.85;
      if (this.portrait) c.fillRect(grid.x, endPos, grid.w, grid.y + grid.h - endPos);
      else c.fillRect(endPos, grid.y, grid.x + grid.w - endPos, grid.h);
      c.globalAlpha = 1;
    }

    // other layers: dimmed, dashed outline, not editable
    const active = this.activeLayer();
    c.setLineDash([3, 3]);
    for (const layer of p.layers) {
      if (layer.id === active.id) continue;
      const color = col['layer-' + layer.color] || col.note;
      for (const n of layer.notes) {
        if (n.start + n.length < tA || n.start > tB) continue;
        const r = this.rect(n.start, n.length, n.pitch);
        c.globalAlpha = 0.3;
        c.fillStyle = color;
        c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        c.globalAlpha = 0.85;
        c.strokeStyle = color;
        c.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
      }
    }
    c.setLineDash([]);
    c.globalAlpha = 1;

    // active layer
    const notes = this.activeNotes();
    const showSel = !this.draft || this.tool === 'select';
    for (const n of notes) {
      if (n.start + n.length < tA || n.start > tB) continue;
      const r = this.rect(n.start, n.length, n.pitch);
      const sel = showSel && this.selection.has(n.start) && this.tool === 'select';
      c.fillStyle = sel ? col['note-selected'] : col.note;
      roundRect(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3);
      c.fill();
      c.strokeStyle = sel ? col.fg : col['note-selected'];
      c.lineWidth = sel ? 2 : 1;
      roundRect(c, r.x + (sel ? 2 : 1.5), r.y + (sel ? 2 : 1.5), r.w - (sel ? 4 : 3), r.h - (sel ? 4 : 3), 3);
      c.stroke();
      // resize grip at the note end
      const len = this.portrait ? r.h : r.w;
      if (len >= 18 && this.tool !== 'erase') {
        c.strokeStyle = col['accent-fg'];
        c.globalAlpha = 0.7;
        c.lineWidth = 1;
        c.beginPath();
        if (this.portrait) { const yy = r.y + r.h - 5.5; c.moveTo(r.x + 4, yy); c.lineTo(r.x + r.w - 4, yy); }
        else { const xx = r.x + r.w - 5.5; c.moveTo(xx, r.y + 4); c.lineTo(xx, r.y + r.h - 4); }
        c.stroke();
        c.globalAlpha = 1;
      }
    }
    c.lineWidth = 1;

    // marquee
    if (this.marquee) {
      const { a, b } = this.marquee;
      c.setLineDash([4, 3]);
      c.strokeStyle = col.accent;
      c.fillStyle = col.accent;
      c.globalAlpha = 0.12;
      c.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      c.globalAlpha = 1;
      c.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      c.setLineDash([]);
    }

    // keyboard cursor
    if (this.showCursor) {
      const r = this.rect(this.snapFloor(this.cursor.t), this.snap, this.cursor.pitch);
      c.strokeStyle = col.accent;
      c.lineWidth = 2;
      c.setLineDash([4, 2]);
      c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      c.setLineDash([]);
      c.lineWidth = 1;
    }

    // playhead
    if (this.playhead != null) {
      const a = Math.round(this.tPos(this.playhead));
      c.fillStyle = col.accent;
      if (this.portrait) c.fillRect(grid.x, a - 1, grid.w, 2);
      else c.fillRect(a - 1, grid.y, 2, grid.h);
    }
    c.restore();

    this.drawRuler(total, tA, tB);
    this.drawKeys(rowA, rowB, pitchOfRow);

    // corner and edges
    c.fillStyle = col['surface-2'];
    if (this.portrait) c.fillRect(0, H - this.keySize, this.rulerSize, this.keySize);
    else c.fillRect(0, 0, this.keySize, this.rulerSize);
    c.strokeStyle = col.border;
    c.beginPath();
    if (this.portrait) {
      c.moveTo(0, H - this.keySize + 0.5); c.lineTo(W, H - this.keySize + 0.5);
      c.moveTo(this.rulerSize - 0.5, 0); c.lineTo(this.rulerSize - 0.5, H);
    } else {
      c.moveTo(this.keySize - 0.5, 0); c.lineTo(this.keySize - 0.5, H);
      c.moveTo(0, this.rulerSize - 0.5); c.lineTo(W, this.rulerSize - 0.5);
    }
    c.stroke();
  }

  drawRuler(total, tA, tB) {
    const c = this.c, col = this.colors;
    const r = this.portrait
      ? { x: 0, y: 0, w: this.rulerSize, h: this.H - this.keySize }
      : { x: this.keySize, y: 0, w: this.W - this.keySize, h: this.rulerSize };
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.fillStyle = col['surface-2'];
    c.fillRect(r.x, r.y, r.w, r.h);
    c.font = `600 11px ${this.font}`;
    c.textBaseline = 'middle';
    c.strokeStyle = col['fg-muted'];
    for (let t = Math.floor(tA / 8) * 8; t <= tB; t += 8) {
      const a = Math.round(this.tPos(t)) + 0.5;
      const measure = t % STEPS_PER_MEASURE === 0;
      const len = measure ? (this.portrait ? r.w : r.h) : 6;
      c.globalAlpha = measure ? 1 : 0.6;
      c.beginPath();
      if (this.portrait) { c.moveTo(r.w - len, a); c.lineTo(r.w, a); }
      else { c.moveTo(a, r.h - len); c.lineTo(a, r.h); }
      c.stroke();
      if (measure && t < total) {
        c.globalAlpha = 1;
        c.fillStyle = col.fg;
        const label = String(t / STEPS_PER_MEASURE + 1);
        if (this.portrait) { c.textAlign = 'center'; c.fillText(label, r.w / 2 - 2, a + 10); }
        else { c.textAlign = 'left'; c.fillText(label, a + 5, r.h / 2); }
      }
    }
    c.globalAlpha = 1;
    // loop end marker
    const e = Math.round(this.tPos(total));
    c.fillStyle = col.fg;
    if (this.portrait) c.fillRect(0, e - 1, r.w, 2); else c.fillRect(e - 1, 0, 2, r.h);
    // playhead marker
    if (this.playhead != null) {
      const a = this.tPos(this.playhead);
      c.fillStyle = col.accent;
      c.beginPath();
      if (this.portrait) { c.moveTo(r.w, a); c.lineTo(r.w - 9, a - 6); c.lineTo(r.w - 9, a + 6); }
      else { c.moveTo(a, r.h); c.lineTo(a - 6, r.h - 9); c.lineTo(a + 6, r.h - 9); }
      c.fill();
    }
    c.restore();
  }

  drawKeys(rowA, rowB, pitchOfRow) {
    const c = this.c, col = this.colors, k = this.keySize;
    const r = this.portrait
      ? { x: this.rulerSize, y: this.H - k, w: this.W - this.rulerSize, h: k }
      : { x: 0, y: this.rulerSize, w: k, h: this.H - this.rulerSize };
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.fillStyle = col['key-white'];
    c.fillRect(r.x, r.y, r.w, r.h);
    const blackLen = Math.round(k * 0.6);
    c.font = `600 10px ${this.font}`;
    c.textBaseline = 'middle';
    for (let row = rowA; row <= rowB; row++) {
      const pitch = pitchOfRow(row);
      const q = this.pPos(pitch);
      const held = this.heldKey === pitch;
      if (isBlack(pitch)) {
        c.fillStyle = held ? col.accent : col['key-black'];
        if (this.portrait) c.fillRect(q + 1, r.y, this.rowPx - 2, blackLen);
        else c.fillRect(0, q + 1, blackLen, this.rowPx - 2);
        // white-key seam continues past the black key
        c.strokeStyle = col.border;
        c.beginPath();
        if (this.portrait) { const x = Math.round(q + this.rowPx / 2) + 0.5; c.moveTo(x, r.y + blackLen); c.lineTo(x, r.y + r.h); }
        else { const y = Math.round(q + this.rowPx / 2) + 0.5; c.moveTo(blackLen, y); c.lineTo(k, y); }
        c.stroke();
      } else {
        if (held) {
          c.fillStyle = col.accent;
          if (this.portrait) c.fillRect(q, r.y, this.rowPx, r.h); else c.fillRect(0, q, k, this.rowPx);
        }
        // full seam where two white keys meet (E-F, B-C)
        const next = this.portrait ? pitch + 1 : pitch - 1;
        if (!isBlack(next)) {
          c.strokeStyle = col.border;
          c.beginPath();
          if (this.portrait) { const x = Math.round(q + this.rowPx) + 0.5; c.moveTo(x, r.y); c.lineTo(x, r.y + r.h); }
          else { const y = Math.round(q + this.rowPx) + 0.5; c.moveTo(0, y); c.lineTo(k, y); }
          c.stroke();
        }
        if (pitch % 12 === 0) {
          c.fillStyle = held ? col['accent-fg'] : col['key-black'];
          const label = noteName(pitch);
          if (this.portrait) { c.textAlign = 'center'; c.font = `600 9px ${this.font}`; c.fillText(label, q + this.rowPx / 2, r.y + r.h - 9); }
          else { c.textAlign = 'right'; c.fillText(label, k - 6, q + this.rowPx / 2); }
        }
      }
    }
    c.restore();
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
