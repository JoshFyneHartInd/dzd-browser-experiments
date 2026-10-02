// Chip presets. Each preset builds one voice for one note.
// build(ctx, out, t, dur, freq, params) schedules the voice and returns
// { end, sources } where `end` is when the voice is fully silent and
// `sources` are the oscillators (so playback can stop them early).
// params: { grit: 0..1, bright: 0..1 }

const waveCache = new WeakMap(); // ctx -> Map(key -> PeriodicWave)
const curveCache = new Map();    // key -> Float32Array

function pulseWave(ctx, duty) {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  const key = 'p' + duty.toFixed(3);
  if (m.has(key)) return m.get(key);
  const N = 64;
  const real = new Float32Array(N), imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
  }
  const w = ctx.createPeriodicWave(real, imag);
  m.set(key, w);
  return w;
}

// Stepped curve: fewer levels = crunchier "low-bit" sound.
function crushCurve(levels) {
  const key = 'c' + levels;
  if (curveCache.has(key)) return curveCache.get(key);
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * levels) / levels;
  }
  curveCache.set(key, c);
  return c;
}

function driveCurve(k) {
  const key = 'd' + k.toFixed(2);
  if (curveCache.has(key)) return curveCache.get(key);
  const n = 2048, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  curveCache.set(key, c);
  return c;
}

function osc(ctx, type, freq, t) {
  const o = ctx.createOscillator();
  if (typeof type === 'number') o.setPeriodicWave(pulseWave(ctx, type));
  else o.type = type;
  // Plain value, no scheduled event: an event at a fractional time lets the
  // default value leak into the first render block, so repeats would differ.
  o.frequency.value = freq;
  return o;
}

// Pitch or gain wobble as an automation curve. Audio-rate modulation
// (an LFO wired into a param) depends on render-block alignment, which
// would make each loop pass sound slightly different and break WAV loops.
function curve(len, rate, fn) {
  const n = Math.max(2, Math.ceil(len * rate));
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * len);
  return c;
}

// FM (phase modulation) rendered into a buffer, cached. Same reason as above.
const fmCache = new Map();
function fmSource(ctx, { fc, ratio, beta0, betaEnd, betaTime, blip = false }, seconds) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(seconds * 4) / 4; // 0.25 s buckets keep the cache small
  const key = [sr, fc.toFixed(3), ratio.toFixed(3), beta0.toFixed(3), betaEnd.toFixed(4), betaTime, blip, len].join('|');
  let buf = fmCache.get(key);
  if (!buf) {
    const n = Math.ceil(len * sr);
    buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const fm = fc * ratio;
    const k = Math.log(betaEnd / beta0) / betaTime;
    const tau = 2 * Math.PI;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beta = t < betaTime ? beta0 * Math.exp(k * t) : betaEnd;
      d[i] = Math.sin(phase + beta * Math.sin(tau * fm * t));
      phase += (tau * (blip && t < 0.015 ? fc * 2 : fc)) / sr;
      if (phase > tau) phase -= tau;
    }
    fmCache.set(key, buf);
    if (fmCache.size > 96) fmCache.delete(fmCache.keys().next().value);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function filter(ctx, type, f, q, t) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

function shaper(ctx, curve) {
  const s = ctx.createWaveShaper();
  s.curve = curve;
  return s;
}

// Chain nodes left to right, return [first, last].
function chain(...nodes) {
  const list = nodes.filter(Boolean);
  for (let i = 0; i < list.length - 1; i++) list[i].connect(list[i + 1]);
  return list;
}

// Grit stage: drive plus bit-crush. Returns array of nodes (may be empty).
function gritStage(ctx, grit, driveMax = 6) {
  const nodes = [];
  if (grit > 0.02) {
    nodes.push(shaper(ctx, driveCurve(1 + grit * driveMax)));
    const levels = Math.max(4, Math.round(48 - grit * 42));
    nodes.push(shaper(ctx, crushCurve(levels)));
  }
  return nodes;
}

// Envelope on a gain param. Linear or exponential decay. Returns end time.
function envelope(param, t, dur, { a = 0.002, d = 0.1, s = 1, r = 0.01, peak = 0.3, exp = false }) {
  const end = t + dur;
  const sus = peak * s;
  param.value = 0;
  param.setValueAtTime(0, t);
  let lvl;
  if (dur <= a) {
    lvl = peak * (dur / a);
    param.linearRampToValueAtTime(lvl, end);
  } else {
    param.linearRampToValueAtTime(peak, t + a);
    if (s >= 0.999) {
      lvl = peak;
      param.setValueAtTime(peak, end);
    } else if (exp) {
      const floor = Math.max(sus, peak * 0.001);
      if (dur <= a + d) {
        lvl = peak * Math.pow(floor / peak, (dur - a) / d);
        param.exponentialRampToValueAtTime(Math.max(lvl, 1e-5), end);
      } else {
        param.exponentialRampToValueAtTime(floor, t + a + d);
        param.setValueAtTime(floor, end);
        lvl = floor;
      }
    } else if (dur <= a + d) {
      lvl = peak + (sus - peak) * ((dur - a) / d);
      param.linearRampToValueAtTime(lvl, end);
    } else {
      param.linearRampToValueAtTime(sus, t + a + d);
      param.setValueAtTime(sus, end);
      lvl = sus;
    }
  }
  param.linearRampToValueAtTime(0, end + r);
  return end + r;
}

function finish(sources, start, end) {
  for (const s of sources) {
    s.start(start);
    s.stop(end + 0.02);
  }
  return { end, sources };
}

export const PRESETS = [
  {
    id: 'Brickphone', name: 'Brickphone',
    desc: 'Hard square through a narrow speaker band. Loud and blunt.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const o = osc(ctx, 0.5, freq, t);
      const bp = filter(ctx, 'bandpass', 900 + bright * 2600, 1.6 + grit * 1.5, t);
      const makeup = ctx.createGain(); makeup.gain.value = 2.2;
      const amp = ctx.createGain();
      chain(o, bp, makeup, ...gritStage(ctx, grit, 8), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.001, s: 1, r: 0.008, peak: 0.42 });
      return finish([o], t, end);
    },
  },
  {
    id: 'PocketPiezo', name: 'Pocket Piezo',
    desc: 'Thin 25% pulse with a buzzy edge, like a tiny piezo beeper.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const o = osc(ctx, 0.25 - grit * 0.14, freq, t);
      const hp = filter(ctx, 'highpass', 500, 0.7, t);
      const lp = filter(ctx, 'lowpass', 2500 + bright * 7500, 0.9, t);
      const buzz = shaper(ctx, driveCurve(2.5 + grit * 6));
      const amp = ctx.createGain();
      chain(o, hp, lp, buzz, ...gritStage(ctx, grit * 0.7), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.001, d: 0.06, s: 0.85, r: 0.01, peak: 0.24 });
      return finish([o], t, end);
    },
  },
  {
    id: 'DialUpDream', name: 'Dial-Up Dream',
    desc: 'Square wave with a gentle, slightly late vibrato.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const rel = 0.04;
      const o = osc(ctx, 0.5, freq * 0.985, t);
      const cents = 8 + grit * 30;
      o.frequency.setValueCurveAtTime(curve(dur + rel, 400, (x) => {
        const glide = x < 0.025 ? 0.985 + 0.015 * (x / 0.025) : 1;
        const depth = x < 0.08 ? 0 : x < 0.3 ? cents * ((x - 0.08) / 0.22) : cents;
        return freq * glide * Math.pow(2, (depth * Math.sin(2 * Math.PI * 5.8 * x)) / 1200);
      }), t, dur + rel);
      const lp = filter(ctx, 'lowpass', 1200 + bright * 6000, 1, t);
      const amp = ctx.createGain();
      chain(o, lp, ...gritStage(ctx, grit * 0.6), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.004, d: 0.12, s: 0.8, r: rel, peak: 0.3 });
      return finish([o], t, end);
    },
  },
  {
    id: 'LobbyBeep', name: 'Lobby Beep',
    desc: 'Soft, rounded triangle. Polite enough for a hotel lobby.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const o = osc(ctx, 'triangle', freq, t);
      const sources = [o];
      const mix = ctx.createGain();
      o.connect(mix);
      if (grit > 0.02) {
        const sq = osc(ctx, 0.5, freq, t);
        const g = ctx.createGain(); g.gain.value = grit * 0.22;
        sq.connect(g).connect(mix);
        sources.push(sq);
      }
      const lp = filter(ctx, 'lowpass', 1500 + bright * 5000, 0.5, t);
      const amp = ctx.createGain();
      chain(mix, lp, amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.008, d: 0.2, s: 0.6, r: 0.12, peak: 0.42 });
      return finish(sources, t, end);
    },
  },
  {
    id: 'GlassFM', name: 'Glass FM',
    desc: 'Bright, bell-like FM tone that rings out.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const rel = 0.25;
      const beta0 = 1.5 + bright * 5;
      const src = fmSource(ctx, { fc: freq, ratio: 3.5 + grit * 0.6, beta0, betaEnd: beta0 * 0.15, betaTime: 0.6 }, dur + rel + 0.05);
      const amp = ctx.createGain();
      chain(src, ...gritStage(ctx, grit * 0.5), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.002, d: 1.2, s: 0.12, r: rel, peak: 0.3, exp: true });
      return finish([src], t, end);
    },
  },
  {
    id: 'Sparkle16', name: 'Sparkle-16',
    desc: 'Plucky FM with a quick decay and an octave blip on the attack.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const len = Math.min(dur, 0.6);
      const beta0 = 3 + bright * 5;
      const src = fmSource(ctx, { fc: freq, ratio: 1 + Math.round(grit * 3), beta0, betaEnd: beta0 * 0.05, betaTime: 0.15, blip: true }, len + 0.1);
      const amp = ctx.createGain();
      chain(src, ...gritStage(ctx, grit * 0.5), amp, out);
      const end = envelope(amp.gain, t, len, { a: 0.001, d: 0.35, s: 0, r: 0.05, peak: 0.34, exp: true });
      return finish([src], t, end);
    },
  },
  {
    id: 'FlipPhoneOrchestra', name: 'Flip Phone Orchestra',
    desc: 'Two thin, detuned pulses that swell like a tiny string pad.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const cents = 6 + grit * 18;
      const r = Math.pow(2, cents / 1200);
      const a = osc(ctx, 0.25, freq * r, t);
      const b = osc(ctx, 0.2, freq / r, t);
      const mix = ctx.createGain(); mix.gain.value = 0.5;
      a.connect(mix); b.connect(mix);
      const lp = filter(ctx, 'lowpass', 1800 + bright * 5000, 0.7, t);
      const amp = ctx.createGain();
      chain(mix, lp, ...gritStage(ctx, grit * 0.4), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.05, d: 0.2, s: 0.8, r: 0.3, peak: 0.44 });
      return finish([a, b], t, end);
    },
  },
  {
    id: 'MallKiosk', name: 'Mall Kiosk',
    desc: 'Cheesy demo-keyboard tone with chorus and tremolo.',
    build(ctx, out, t, dur, freq, { grit, bright }) {
      const s1 = osc(ctx, 'sawtooth', freq, t);
      const s2 = osc(ctx, 'sawtooth', freq * Math.pow(2, 7 / 1200), t);
      const up = osc(ctx, 0.5, freq * 2, t);
      const mix = ctx.createGain(); mix.gain.value = 0.38;
      const upG = ctx.createGain(); upG.gain.value = 0.3;
      s1.connect(mix); s2.connect(mix); up.connect(upG).connect(mix);
      const lp = filter(ctx, 'lowpass', 2000 + bright * 6000, 3, t);
      const trem = ctx.createGain();
      const depth = 0.12 + grit * 0.33;
      trem.gain.value = 1;
      trem.gain.setValueCurveAtTime(curve(dur + 0.08, 200, (x) => 1 + depth * Math.sin(2 * Math.PI * 6 * x)), t, dur + 0.08);
      const amp = ctx.createGain();
      chain(mix, lp, trem, ...gritStage(ctx, grit * 0.3), amp, out);
      const end = envelope(amp.gain, t, dur, { a: 0.005, d: 0.1, s: 0.9, r: 0.08, peak: 0.3 });
      return finish([s1, s2, up], t, end);
    },
  },
];

const byId = new Map(PRESETS.map((p) => [p.id.toLowerCase(), p]));

export function getPreset(id) {
  return byId.get(String(id || '').toLowerCase()) || PRESETS[0];
}

// Lookup that tolerates names with spaces or dashes ("Glass FM", "sparkle-16").
export function findPreset(nameOrId) {
  const key = String(nameOrId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRESETS.find((p) => p.id.toLowerCase() === key) || null;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Global "Phone speaker" effect: band-pass ~400 Hz–4 kHz plus mild distortion.
export function buildSpeaker(ctx) {
  const hp = filter(ctx, 'highpass', 400, 0.7, 0);
  const lp = filter(ctx, 'lowpass', 4000, 0.7, 0);
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking'; peak.frequency.value = 2000; peak.Q.value = 1; peak.gain.value = 4;
  const dist = shaper(ctx, driveCurve(1.8));
  chain(hp, lp, peak, dist);
  return { input: hp, output: dist };
}
