// RTTTL parse and serialize.
// Steps are 32nd notes: whole = 32, half = 16, quarter = 8 ... 32nd = 1.

import { MIN_PITCH, MAX_PITCH, BPM_MIN, BPM_MAX, ALLOWED_LENGTHS, fitLength, cleanName } from './state.js';

const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DUR_STEPS = { 1: 32, 2: 16, 4: 8, 8: 4, 16: 2, 32: 1 };
const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
// steps -> [denominator, dotted]
const STEP_TOKEN = {
  32: [1, false], 16: [2, false], 8: [4, false], 4: [8, false], 2: [16, false], 1: [32, false],
  48: [1, true], 24: [2, true], 12: [4, true], 6: [8, true], 3: [16, true],
};

// Split a section on commas, keeping each piece's offset in the original text.
function splitWithOffsets(text, offset) {
  const parts = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ',') {
      const raw = text.slice(start, i);
      const lead = raw.length - raw.trimStart().length;
      parts.push({ raw, clean: raw.replace(/\s+/g, '').toLowerCase(), pos: offset + start + lead + 1 });
      start = i + 1;
    }
  }
  return parts;
}

/**
 * Parse RTTTL text.
 * Returns { ok, name, bpm, notes:[{start,length,pitch}], totalSteps, warnings:[{pos,message}], error:{pos,message}|null }
 * Positions are 1-based character positions in the input.
 */
export function parseRTTTL(input) {
  const src = String(input ?? '').replace(/^﻿/, '');
  const warnings = [];
  const fail = (pos, message) => ({ ok: false, name: '', bpm: 63, notes: [], totalSteps: 0, warnings, error: { pos, message } });

  if (!src.trim()) return fail(1, 'The text is empty. Paste an RTTTL tune like  name:d=4,o=5,b=120:8c,8d,8e');

  let nameRaw = '', defRaw = '', defOff = 0, notesRaw, notesOff;
  const c1 = src.indexOf(':');
  const c2 = c1 >= 0 ? src.indexOf(':', c1 + 1) : -1;
  if (c2 >= 0) {
    nameRaw = src.slice(0, c1);
    defRaw = src.slice(c1 + 1, c2); defOff = c1 + 1;
    notesRaw = src.slice(c2 + 1); notesOff = c2 + 1;
  } else if (c1 >= 0) {
    const head = src.slice(0, c1);
    if (head.includes('=')) { defRaw = head; defOff = 0; } else nameRaw = head;
    notesRaw = src.slice(c1 + 1); notesOff = c1 + 1;
  } else {
    notesRaw = src; notesOff = 0;
  }

  // Defaults (RTTTL standard: d=4, o=6, b=63)
  let d = 4, o = 6, b = 63;
  for (const part of splitWithOffsets(defRaw, defOff)) {
    if (!part.clean) continue;
    const m = part.clean.match(/^([dob])=(\d+)$/);
    if (!m) { warnings.push({ pos: part.pos, message: `Skipped unknown setting "${part.raw.trim()}".` }); continue; }
    const v = Number(m[2]);
    if (m[1] === 'd') {
      if (!DUR_STEPS[v]) return fail(part.pos, `Default duration d=${v} is not valid. Use 1, 2, 4, 8, 16 or 32.`);
      d = v;
    } else if (m[1] === 'o') {
      if (v < 4 || v > 7) return fail(part.pos, `Default octave o=${v} is out of range. Use 4 to 7.`);
      o = v;
    } else {
      if (v < BPM_MIN || v > BPM_MAX) {
        const c = Math.min(BPM_MAX, Math.max(BPM_MIN, v));
        warnings.push({ pos: part.pos, message: `Tempo b=${v} is outside ${BPM_MIN}–${BPM_MAX}; using ${c}.` });
        b = c;
      } else b = v;
    }
  }

  const notes = [];
  let cursor = 0;
  let sawEvent = false;
  for (const part of splitWithOffsets(notesRaw, notesOff)) {
    if (!part.clean) continue;
    // duration, note, sharp, dot (before octave), octave, dot (after octave)
    const m = part.clean.match(/^(\d+)?([a-gp])(#)?(\.)?(\d+)?(\.)?$/);
    if (!m) { warnings.push({ pos: part.pos, message: `Skipped unknown token "${part.raw.trim()}".` }); continue; }
    const [, durS, letter, sharp, dot1, octS, dot2] = m;
    const den = durS ? Number(durS) : d;
    if (!DUR_STEPS[den]) return fail(part.pos, `Duration ${den} in "${part.raw.trim()}" is not valid. Use 1, 2, 4, 8, 16 or 32.`);
    let steps = DUR_STEPS[den];
    if (dot1 || dot2) {
      if (den === 32) {
        warnings.push({ pos: part.pos, message: `Dotted 1/32 notes are not supported; "${part.raw.trim()}" was made a 1/16.` });
        steps = 2;
      } else steps = steps * 1.5;
    }
    sawEvent = true;
    if (letter === 'p') { cursor += steps; continue; }
    const oct = octS ? Number(octS) : o;
    if (oct < 4 || oct > 7) return fail(part.pos, `Octave ${oct} in "${part.raw.trim()}" is out of range. Use 4 to 7.`);
    let pitch = (oct + 1) * 12 + SEMI[letter] + (sharp ? 1 : 0);
    if (pitch > MAX_PITCH) {
      warnings.push({ pos: part.pos, message: `"${part.raw.trim()}" is above B7; moved down an octave.` });
      pitch -= 12;
    }
    if (pitch < MIN_PITCH) pitch += 12;
    notes.push({ start: cursor, length: steps, pitch });
    cursor += steps;
  }

  if (!sawEvent) return fail(notesOff + 1, 'No notes found after the second colon.');

  return {
    ok: true,
    name: cleanName(nameRaw, ''),
    bpm: b,
    notes,
    totalSteps: cursor,
    warnings,
    error: null,
  };
}

// Break a gap into allowed lengths (largest first).
export function decompose(n) {
  const out = [];
  const desc = [...ALLOWED_LENGTHS].sort((a, b) => b - a);
  while (n > 0) {
    const l = desc.find((x) => x <= n);
    out.push(l);
    n -= l;
  }
  return out;
}

function mostCommon(values, fallback) {
  const counts = new Map();
  let best = fallback, bestN = 0;
  for (const v of values) {
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > bestN || (c === bestN && v === fallback)) { best = v; bestN = c; }
  }
  return best;
}

export function rtttlName(name) {
  return String(name || '').replace(/[:,\r\n|~]/g, '').trim().slice(0, 10) || 'Bleepr';
}

/** Serialize one layer. Pads with rests to `total` steps so the loop length survives a round trip. */
export function serializeRTTTL(name, notes, bpm, total) {
  const events = []; // { steps, pitch|null }
  let cursor = 0;
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (const n of sorted) {
    if (n.start > cursor) for (const r of decompose(n.start - cursor)) events.push({ steps: r, pitch: null });
    const len = STEP_TOKEN[n.length] ? n.length : fitLength(n.length) || 1;
    events.push({ steps: len, pitch: n.pitch });
    if (len < n.length) for (const r of decompose(n.length - len)) events.push({ steps: r, pitch: null });
    cursor = n.start + n.length;
  }
  if (cursor < total) for (const r of decompose(total - cursor)) events.push({ steps: r, pitch: null });

  const d = mostCommon(events.map((e) => STEP_TOKEN[e.steps][0]), 4);
  const o = mostCommon(events.filter((e) => e.pitch != null).map((e) => Math.floor(e.pitch / 12) - 1), 5);

  const tokens = events.map((e) => {
    const [den, dotted] = STEP_TOKEN[e.steps];
    const dur = den === d ? '' : String(den);
    if (e.pitch == null) return `${dur}p${dotted ? '.' : ''}`;
    const oct = Math.floor(e.pitch / 12) - 1;
    return `${dur}${NAMES[e.pitch % 12]}${oct === o ? '' : oct}${dotted ? '.' : ''}`;
  });
  return `${rtttlName(name)}:d=${d},o=${o},b=${Math.round(bpm)}:${tokens.join(',')}`;
}

export function noteName(pitch) {
  return NAMES[pitch % 12].toUpperCase() + (Math.floor(pitch / 12) - 1);
}

