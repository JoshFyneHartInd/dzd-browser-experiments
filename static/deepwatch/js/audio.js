// Web Audio synthesis only. No sample files. Healthy is silent.
let ctx = null, master = null;
const S = { volume: 0.6, muted: false };
const alarm = { level: 0, acked: 0, lastPlay: 0, crisisLast: 0 };

export function configure({ volume, muted } = {}) {
  if (typeof volume === 'number') S.volume = Math.min(1, Math.max(0, volume));
  if (typeof muted === 'boolean') S.muted = muted;
  applyGain();
}
export const settings = () => ({ ...S });

function applyGain() {
  if (master) master.gain.value = S.muted ? 0 : S.volume * S.volume * 0.5;
}

/** Call from a user gesture (Start, Continue, any click). Safe to call repeatedly. */
export function unlock() {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyGain();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = null, attack = 0.005 } = {}) {
  if (!ctx || S.muted || S.volume === 0) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.1, at = 0, freq = 2000, q = 1 } = {}) {
  if (!ctx || S.muted || S.volume === 0) return;
  const t0 = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const click = () => tone(1400, 0.03, { type: 'square', vol: 0.05 });
export const tick = () => tone(900, 0.02, { type: 'triangle', vol: 0.035 });
export const confirm = () => { tone(660, 0.09, { vol: 0.09 }); tone(990, 0.12, { vol: 0.09, at: 0.08 }); };
export const blip = () => tone(520, 0.08, { type: 'triangle', vol: 0.07 });
export const glitch = () => { noise(0.12, { vol: 0.07, freq: 3200, q: 4 }); tone(180, 0.1, { type: 'sawtooth', vol: 0.04, slide: 90 }); };
export const gameOver = () => { tone(220, 0.9, { type: 'sawtooth', vol: 0.12, slide: 55 }); tone(165, 1.2, { type: 'triangle', vol: 0.1, at: 0.15, slide: 41 }); };

const cautionChime = () => { tone(740, 0.35, { vol: 0.05 }); tone(988, 0.45, { vol: 0.04, at: 0.12 }); };
const alertTone = () => { tone(520, 0.18, { type: 'triangle', vol: 0.09 }); tone(520, 0.18, { type: 'triangle', vol: 0.09, at: 0.26 }); };
const criticalAlarm = () => { for (let i = 0; i < 3; i++) tone(i % 2 ? 640 : 880, 0.16, { type: 'square', vol: 0.07, at: i * 0.2 }); };
const crisisTone = () => { tone(300, 0.5, { type: 'sawtooth', vol: 0.09, slide: 520 }); tone(520, 0.5, { type: 'sawtooth', vol: 0.09, at: 0.55, slide: 300 }); };

/**
 * Drive alarms from the highest displayed state (0 healthy .. 3 critical). Call about once a second.
 * Caution chimes once. Alert repeats at most every 12 s. Critical repeats every 5 s. ack() silences until the level rises.
 */
export function alarmTick(level, nowMs) {
  if (level < alarm.acked) alarm.acked = level;
  const rising = level > alarm.level;
  alarm.level = level;
  if (level === 0 || level <= alarm.acked) return;
  const gap = level === 1 ? Infinity : level === 2 ? 12000 : 5000;
  if (rising || nowMs - alarm.lastPlay >= gap) {
    alarm.lastPlay = nowMs;
    (level === 1 ? cautionChime : level === 2 ? alertTone : criticalAlarm)();
  }
}
export function ack() { alarm.acked = alarm.level; }
export const isAcked = () => alarm.level > 0 && alarm.level <= alarm.acked;

/** Crisis warning tone: distinct, repeats every 3 s while the warning is active. */
export function crisisTick(active, nowMs) {
  if (!active) { alarm.crisisLast = 0; return; }
  if (nowMs - alarm.crisisLast >= 3000) { alarm.crisisLast = nowMs; crisisTone(); }
}

export function resetAlarms() { alarm.level = 0; alarm.acked = 0; alarm.lastPlay = 0; alarm.crisisLast = 0; }
