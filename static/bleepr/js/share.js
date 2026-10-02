// Share strings: plain RTTTL for one layer, RTMX1 wrapper for a full tune,
// and the URL hash form.
//
// Wrapper format:
//   RTMX1|bpm=120|m=4|name=My%20Tune
//   Brickphone(50,50,80)~Lead:d=4,o=5,b=120:8c,8d,...
// The "(grit,bright,volume)" part (0-100) and name= are optional extras;
// the importer accepts lines without them.

import {
  STEPS_PER_MEASURE, MAX_LAYERS, MEASURES_MIN, MEASURES_MAX, BPM_MIN, BPM_MAX,
  clamp, createLayer, cleanName, maxMeasuresFor, insertNotes, normalizeProject,
} from './state.js';
import { parseRTTTL, serializeRTTTL } from './rtttl.js';
import { findPreset, PRESETS } from './presets.js';

export const MAGIC = 'RTMX1|';
const HASH_KEY = '#tune=';

export const isWrapper = (text) => String(text || '').trim().toUpperCase().startsWith(MAGIC);

export function layerToRTTTL(project, layer) {
  return serializeRTTTL(layer.name, layer.notes, project.bpm, project.measures * STEPS_PER_MEASURE);
}

export function encodeWrapper(project) {
  const total = project.measures * STEPS_PER_MEASURE;
  const head = `RTMX1|bpm=${project.bpm}|m=${project.measures}|name=${encodeURIComponent(project.name)}`;
  const pct = (v) => Math.round(v * 100);
  const lines = project.layers.map((l) => {
    const params = `(${pct(l.params.grit)},${pct(l.params.bright)},${pct(l.volume)})`;
    return `${l.presetId}${params}~${serializeRTTTL(l.name, l.notes, project.bpm, total)}`;
  });
  return [head, ...lines].join('\n');
}

/**
 * Decode a wrapper into a project.
 * Returns { ok, project, warnings:[string], error:string|null }
 */
export function decodeWrapper(text) {
  const warnings = [];
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length || !isWrapper(lines[0])) return { ok: false, error: 'The first line must start with RTMX1|', warnings };

  const head = {};
  for (const part of lines[0].split('|').slice(1)) {
    const i = part.indexOf('=');
    if (i > 0) head[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  let bpm = Math.round(Number(head.bpm) || 120);
  if (bpm < BPM_MIN || bpm > BPM_MAX) { warnings.push(`Tempo ${bpm} is out of range; clamped.`); bpm = clamp(bpm, BPM_MIN, BPM_MAX); }
  let measures = clamp(Math.round(Number(head.m) || 4), MEASURES_MIN, MEASURES_MAX);
  const maxM = maxMeasuresFor(bpm);
  if (measures > maxM) { warnings.push(`Shortened to ${maxM} measures to stay under 30 seconds.`); measures = maxM; }
  let name = 'Shared';
  try { if (head.name) name = cleanName(decodeURIComponent(head.name), 'Shared'); } catch { /* keep default */ }

  const total = measures * STEPS_PER_MEASURE;
  const layers = [];
  let lineNo = 1;
  for (const line of lines.slice(1)) {
    lineNo++;
    if (layers.length >= MAX_LAYERS) { warnings.push(`Only ${MAX_LAYERS} layers are allowed; extra lines were skipped.`); break; }
    const m = line.match(/^([A-Za-z0-9 _-]+?)\s*(?:\(([^)]*)\))?\s*~(.*)$/);
    if (!m) { warnings.push(`Line ${lineNo}: skipped (expected Chip~rtttl).`); continue; }
    const preset = findPreset(m[1]);
    if (!preset) warnings.push(`Line ${lineNo}: unknown chip "${m[1]}", using ${PRESETS[0].name}.`);
    const res = parseRTTTL(m[3]);
    if (!res.ok) return { ok: false, error: `Line ${lineNo}, character ${res.error.pos}: ${res.error.message}`, warnings };
    for (const w of res.warnings) warnings.push(`Line ${lineNo}, character ${w.pos}: ${w.message}`);
    const layer = createLayer(preset ? preset.id : PRESETS[0].id, layers, res.name || undefined);
    if (m[2]) {
      const [g, b, v] = m[2].split(',').map((x) => Number(x));
      if (Number.isFinite(g)) layer.params.grit = clamp(g / 100, 0, 1);
      if (Number.isFinite(b)) layer.params.bright = clamp(b / 100, 0, 1);
      if (Number.isFinite(v)) layer.volume = clamp(v / 100, 0, 1);
    }
    if (res.notes.some((n) => n.start + n.length > total)) warnings.push(`Line ${lineNo}: notes past measure ${measures} were cut.`);
    layer.notes = insertNotes([], res.notes, total);
    layers.push(layer);
  }
  if (!layers.length) return { ok: false, error: 'No layers found after the first line.', warnings };
  const project = normalizeProject({ name, bpm, measures, layers, activeLayerId: layers[0].id });
  return { ok: true, project, warnings, error: null };
}

export function toHash(wrapper) {
  return HASH_KEY + encodeURIComponent(wrapper);
}

export function fromHash(hash) {
  if (!hash || !hash.startsWith(HASH_KEY)) return null;
  try { return decodeURIComponent(hash.slice(HASH_KEY.length)); } catch { return null; }
}
