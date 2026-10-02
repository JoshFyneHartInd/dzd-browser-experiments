// Synth playback (look-ahead scheduler) and WAV export.

import { getPreset, midiToFreq, buildSpeaker } from './presets.js';
import { STEPS_PER_MEASURE, loopSeconds, audible } from './state.js';

const TIMER_MS = 25;      // scheduler tick
const LOOKAHEAD = 0.1;    // seconds scheduled ahead
const STOP_RAMP = 0.01;   // anti-click ramp on Stop
const SPEAKER_MAKEUP = 1.6;
export const SAMPLE_RATE = 44100;

export const layerGain = (layer) => layer.volume * layer.volume;

// Soft limiter: clean below 0.6, then rounds off toward 1.0. A memoryless
// curve (not a compressor) so every loop pass in a WAV renders identically.
let limiterCurve = null;
function makeLimiter(ctx) {
  if (!limiterCurve) {
    const n = 4096;
    limiterCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2; // input range -2..2
      const a = Math.abs(x);
      const y = a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
      limiterCurve[i] = Math.sign(x) * y;
    }
  }
  const pre = ctx.createGain();
  pre.gain.value = 0.5; // maps -2..2 onto the shaper's -1..1 input
  const shape = ctx.createWaveShaper();
  shape.curve = limiterCurve;
  pre.connect(shape);
  // behave like one node: connect into .input, out of .output
  return { input: pre, output: shape };
}

function timing(p) {
  const total = p.measures * STEPS_PER_MEASURE;
  const loopDur = loopSeconds(p.measures, p.bpm);
  return { total, loopDur, stepSec: loopDur / total };
}

// Map step -> [[layer, note], ...] for all layers.
function indexNotes(p) {
  const map = new Map();
  for (const layer of p.layers) {
    for (const n of layer.notes) {
      let list = map.get(n.start);
      if (!list) map.set(n.start, (list = []));
      list.push([layer, n]);
    }
  }
  return map;
}

export class Engine {
  constructor(getProject) {
    this.getProject = getProject;
    this.ctx = null;
    this.session = null;
    this.loop = true;
    this.speaker = false;
    this.onStop = null;
    this.lastPreview = null;
  }

  // Create or resume the AudioContext. Call from a user gesture.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.input = c.createGain();
      this.input.gain.value = 0.8;
      this.direct = c.createGain();
      this.wet = c.createGain();
      this.sp = buildSpeaker(c);
      this.limiter = makeLimiter(c);
      this.input.connect(this.direct).connect(this.limiter.input);
      this.input.connect(this.sp.input);
      this.sp.output.connect(this.wet).connect(this.limiter.input);
      this.limiter.output.connect(c.destination);
      this.previewBus = c.createGain();
      this.previewBus.connect(this.input);
      this.direct.gain.value = this.speaker ? 0 : 1;
      this.wet.gain.value = this.speaker ? SPEAKER_MAKEUP : 0;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setSpeaker(on) {
    this.speaker = !!on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.direct.gain.setTargetAtTime(this.speaker ? 0 : 1, t, 0.01);
    this.wet.gain.setTargetAtTime(this.speaker ? SPEAKER_MAKEUP : 0, t, 0.01);
  }

  // ----- previews -----
  previewNote(layer, pitch, dur = 0.3) {
    const c = this.ensure();
    const g = c.createGain();
    g.gain.value = layerGain(layer);
    g.connect(this.previewBus);
    const v = getPreset(layer.presetId).build(c, g, c.currentTime + 0.005, dur, midiToFreq(pitch), layer.params);
    v.sources[0].onended = () => g.disconnect();
  }

  // Short arpeggio so a chip can be heard in the picker.
  previewPreset(presetId, params, volume = 0.8) {
    const c = this.ensure();
    if (this.lastPreview) {
      const old = this.lastPreview;
      old.gain.setTargetAtTime(0, c.currentTime, 0.01);
      setTimeout(() => old.disconnect(), 200);
    }
    const g = c.createGain();
    g.gain.value = volume * volume;
    g.connect(this.previewBus);
    this.lastPreview = g;
    const preset = getPreset(presetId);
    const t0 = c.currentTime + 0.02;
    [72, 76, 79, 84].forEach((m, i) => preset.build(c, g, t0 + i * 0.15, i === 3 ? 0.4 : 0.13, midiToFreq(m), params));
  }

  // ----- playback -----
  get playing() { return !!this.session; }

  play() {
    if (this.session) return;
    const c = this.ensure();
    const p = this.getProject();
    const t = timing(p);
    const s = {
      bus: c.createGain(),
      layerGains: new Map(),
      voices: new Set(),
      total: t.total,
      loopDur: t.loopDur,
      stepSec: t.stepSec,
      anchor: c.currentTime + 0.06, // pass k starts at anchor + k * loopDur
      k: 0,
      s: 0,
      finished: false,
      endAt: 0,
      playEnd: 0,
    };
    s.startAt = s.anchor;
    s.bus.connect(this.input);
    this.session = s;
    s.timer = setInterval(() => this.tick(), TIMER_MS);
    this.tick();
  }

  tick() {
    const s = this.session;
    if (!s) return;
    const c = this.ctx;
    const p = this.getProject();
    const t = timing(p);

    // Tempo or length changed while playing: keep going from the next step.
    if (t.total !== s.total || Math.abs(t.loopDur - s.loopDur) > 1e-9) {
      const next = s.anchor + s.k * s.loopDur + s.s * s.stepSec;
      const step = s.s >= t.total ? 0 : s.s;
      s.total = t.total; s.loopDur = t.loopDur; s.stepSec = t.stepSec;
      s.anchor = next - step * s.stepSec;
      s.k = 0; s.s = step;
    }

    const horizon = c.currentTime + LOOKAHEAD;
    let index = null;
    while (!s.finished) {
      // Absolute time from the pass index, never accumulated.
      const time = s.anchor + s.k * s.loopDur + s.s * s.stepSec;
      if (time >= horizon) break;
      if (!this.loop && s.s === 0 && s.k > 0) {
        s.finished = true;
        s.playEnd = time;
        s.endAt = time + 0.6; // let release tails ring
        break;
      }
      if (!index) index = indexNotes(p);
      const list = index.get(s.s);
      if (list && time >= c.currentTime - 0.02) {
        for (const [layer, note] of list) this.startVoice(s, p, layer, note, time);
      }
      s.s++;
      if (s.s >= s.total) { s.s = 0; s.k++; }
    }
    if (s.finished && c.currentTime >= s.endAt) this.stop();
  }

  startVoice(s, p, layer, note, time) {
    const c = this.ctx;
    let g = s.layerGains.get(layer.id);
    if (!g) {
      g = c.createGain();
      g.gain.value = audible(layer, p.layers) ? layerGain(layer) : 0;
      g.connect(s.bus);
      s.layerGains.set(layer.id, g);
    }
    const v = getPreset(layer.presetId).build(c, g, time, note.length * s.stepSec, midiToFreq(note.pitch), layer.params);
    s.voices.add(v);
    v.sources[0].onended = () => s.voices.delete(v);
  }

  // Apply mute / solo / volume live.
  updateMix() {
    const s = this.session;
    if (!s) return;
    const p = this.getProject();
    const now = this.ctx.currentTime;
    for (const layer of p.layers) {
      const g = s.layerGains.get(layer.id);
      if (g) g.gain.setTargetAtTime(audible(layer, p.layers) ? layerGain(layer) : 0, now, 0.008);
    }
  }

  stop() {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearInterval(s.timer);
    const now = this.ctx.currentTime;
    s.bus.gain.cancelScheduledValues(now);
    s.bus.gain.setValueAtTime(s.bus.gain.value, now);
    s.bus.gain.linearRampToValueAtTime(0, now + STOP_RAMP);
    for (const v of s.voices) for (const src of v.sources) { try { src.stop(now + STOP_RAMP + 0.005); } catch { /* already stopped */ } }
    setTimeout(() => { try { s.bus.disconnect(); } catch { /* gone */ } }, 120);
    if (this.onStop) this.onStop();
  }

  // Current playhead position in steps (float), or null when stopped.
  playheadStep() {
    const s = this.session;
    if (!s) return null;
    const c = this.ctx;
    const now = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    if (now < s.startAt) return 0;
    if (s.finished && now >= s.playEnd) return null;
    const pos = (now - s.anchor) / s.stepSec;
    return ((pos % s.total) + s.total) % s.total;
  }
}

// ---------- WAV export ----------

/**
 * Render the tune offline.
 * Perfect loop: render one extra pre-roll pass, discard it, keep `repeats`
 * passes, so release tails from the end wrap into the start.
 * With a fade, skip the pre-roll and ramp the last `fade` seconds to silence.
 */
export async function renderTune(project, { repeats = 1, fade = 0, speaker = false } = {}) {
  const sr = SAMPLE_RATE;
  const loopSamples = Math.round(loopSeconds(project.measures, project.bpm) * sr);
  const total = project.measures * STEPS_PER_MEASURE;
  const stepSamples = loopSamples / total;
  const pre = fade > 0 ? 0 : 1;
  const passes = pre + repeats;
  const length = passes * loopSamples;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = new OAC(1, length, sr);

  const input = c.createGain();
  input.gain.value = 0.8;
  const limiter = makeLimiter(c);
  if (speaker) {
    const sp = buildSpeaker(c);
    const wet = c.createGain();
    wet.gain.value = SPEAKER_MAKEUP;
    input.connect(sp.input);
    sp.output.connect(wet).connect(limiter.input);
  } else {
    input.connect(limiter.input);
  }
  const post = c.createGain();
  limiter.output.connect(post).connect(c.destination);
  if (fade > 0) {
    const T = length / sr;
    const f = Math.min(fade, T);
    post.gain.setValueAtTime(1, T - f);
    post.gain.linearRampToValueAtTime(0, T);
  }

  for (const layer of project.layers) {
    if (!audible(layer, project.layers) || !layer.notes.length) continue;
    const g = c.createGain();
    g.gain.value = layerGain(layer);
    g.connect(input);
    const preset = getPreset(layer.presetId);
    // Place every note on the same sample frame in every pass, so each pass
    // renders identically (a one-sample wobble would change oscillator phase).
    for (let k = 0; k < passes; k++) {
      for (const n of layer.notes) {
        const frame = k * loopSamples + Math.round(n.start * stepSamples);
        const dur = Math.round(n.length * stepSamples) / sr;
        preset.build(c, g, (frame + 0.25) / sr, dur, midiToFreq(n.pitch), layer.params);
      }
    }
  }

  const buf = await c.startRendering();
  const samples = buf.getChannelData(0).slice(pre * loopSamples);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0.999) {
    const k = 0.999 / peak; // constant gain keeps the loop seamless
    for (let i = 0; i < samples.length; i++) samples[i] *= k;
  }
  return { samples, sampleRate: sr, loopSamples };
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Loop seam check: the last→first jump vs. the largest normal step. */
export function seamCheck(samples) {
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
  const jump = Math.abs(samples[0] - samples[samples.length - 1]);
  return { jump, maxStep, ok: jump <= maxStep };
}
