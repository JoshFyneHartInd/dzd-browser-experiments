// Bleepr: bootstrap and UI wiring.

import {
  store, MAX_LAYERS, MEASURES_MIN, MEASURES_MAX, BPM_MAX, STEPS_PER_MEASURE, MAX_SECONDS,
  clamp, loopSeconds, fitsLimit, minBpmFor, maxMeasuresFor, createLayer, createProject,
  cleanName, trimToTotal, insertNotes, isEmptyProject, storage, totalSteps,
} from './state.js';
import { PRESETS, getPreset } from './presets.js';
import { Engine, renderTune, encodeWav } from './audio.js';
import { Roll } from './roll.js';
import { parseRTTTL } from './rtttl.js';
import { isWrapper, encodeWrapper, decodeWrapper, layerToRTTTL, toHash, fromHash } from './share.js';
import { mountThemePicker } from './theme-picker.js';
import { EXAMPLES } from './examples.js';

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (name) => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p = () => store.project;

// ---------- icons: reveal once the font is ready ----------
(function iconsWhenReady() {
  const root = document.documentElement;
  const ready = () => root.classList.add('icons-ready');
  const failed = setTimeout(() => {
    if (!root.classList.contains('icons-ready')) root.classList.add('icons-failed');
  }, 5000);
  if (!document.fonts || !document.fonts.load) { ready(); clearTimeout(failed); return; }
  document.fonts.load('24px "Material Symbols Outlined"', 'play_arrow').then((faces) => {
    if (faces.length) { clearTimeout(failed); root.classList.remove('icons-failed'); ready(); }
  }).catch(() => {});
  document.fonts.ready.then(() => {
    if (document.fonts.check('24px "Material Symbols Outlined"', 'play_arrow')) {
      clearTimeout(failed); root.classList.remove('icons-failed'); ready();
    }
  });
})();

// ---------- engine and roll ----------
const engine = new Engine(() => store.project);
engine.setSpeaker(storage.get('bleepr.speaker') === true);

const live = $('#live');
const announce = (msg) => { live.textContent = ''; setTimeout(() => (live.textContent = msg), 30); };

const roll = new Roll($('#roll'), {
  engine,
  onSelection: (n) => { $('#btn-delete').disabled = n === 0; },
  onStatus: announce,
});

// Create / resume the AudioContext on the first user gesture.
const unlock = () => { engine.ensure(); };
document.addEventListener('pointerdown', unlock, { once: true, capture: true });
document.addEventListener('keydown', unlock, { once: true, capture: true });

mountThemePicker($('#theme-picker'));

// ---------- toast ----------
let toastTimer = 0;
function toast(msg, action) {
  const el = $('#toast');
  $('#toast-msg').textContent = msg;
  const btn = $('#toast-action');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { el.hidden = true; action.run(); };
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3500);
}
const undoAction = { label: 'Undo', run: () => store.undo() };

// ---------- confirm dialog ----------
function ask(title, message, buttons) {
  const dlg = $('#dlg-confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = message;
  const actions = $('#confirm-actions');
  actions.innerHTML = buttons.map((b) => `<button value="${b.value}" class="btn text-btn${b.primary ? ' primary' : ''}">${esc(b.label)}</button>`).join('');
  return new Promise((resolve) => {
    dlg.returnValue = 'cancel';
    dlg.addEventListener('close', () => resolve(dlg.returnValue || 'cancel'), { once: true });
    dlg.showModal();
  });
}

// Before replacing the current tune. Returns true if it's OK to go ahead.
async function okToReplace(what) {
  if (!store.dirty || isEmptyProject(p())) return true;
  const answer = await ask(
    'Unsaved changes',
    `"${p().name}" has changes that aren't saved in My tunes. ${what}`,
    [
      { value: 'cancel', label: 'Cancel' },
      { value: 'discard', label: 'Discard changes' },
      { value: 'save', label: 'Save first', primary: true },
    ],
  );
  if (answer === 'save') { store.saveCurrent(); toast(`Saved "${p().name}"`); return true; }
  return answer === 'discard';
}

// ---------- header: name, tempo, measures, speaker ----------
const nameInput = $('#tune-name');
nameInput.addEventListener('input', () => {
  const v = nameInput.value;
  store.update((pr) => { pr.name = cleanName(v); }, { coalesce: 'name', reason: 'name' });
});
nameInput.addEventListener('blur', () => { nameInput.value = p().name; });

const bpmInput = $('#bpm');
function setBpm(v, coalesce = 'bpm') {
  const min = minBpmFor(p().measures);
  let bpm = clamp(Math.round(Number(v) || p().bpm), min, BPM_MAX);
  if (Number(v) < min) limitMsg(`At ${p().measures} measures the tempo can't go below ${min} BPM (${MAX_SECONDS} s loop limit).`);
  if (bpm === p().bpm) { renderHeader(); return; }
  store.update((pr) => { pr.bpm = bpm; }, { coalesce, reason: 'tempo' });
}
bpmInput.addEventListener('change', () => setBpm(bpmInput.value, null));
bpmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') bpmInput.blur(); });
$('#bpm-down').addEventListener('click', () => setBpm(p().bpm - 1));
$('#bpm-up').addEventListener('click', () => setBpm(p().bpm + 1));

function setMeasures(m) {
  m = clamp(m, MEASURES_MIN, MEASURES_MAX);
  if (!fitsLimit(m, p().bpm)) { limitMsg(`Loops can't be longer than ${MAX_SECONDS} s. Raise the tempo to add measures.`); return; }
  const total = m * STEPS_PER_MEASURE;
  const losing = p().layers.some((l) => l.notes.some((n) => n.start + n.length > total));
  store.update((pr) => {
    pr.measures = m;
    for (const l of pr.layers) l.notes = trimToTotal(l.notes, total);
  }, { coalesce: losing ? null : 'measures', reason: 'measures' });
  if (losing) toast(`Notes past measure ${m} were removed.`, undoAction);
}
$('#meas-down').addEventListener('click', () => setMeasures(p().measures - 1));
$('#meas-up').addEventListener('click', () => setMeasures(p().measures + 1));

let limitTimer = 0;
function limitMsg(text) {
  const el = $('#limit-msg');
  el.textContent = text;
  clearTimeout(limitTimer);
  limitTimer = setTimeout(() => (el.textContent = ''), 5000);
}

const speakerBtn = $('#btn-speaker');
speakerBtn.addEventListener('click', () => {
  const on = !engine.speaker;
  engine.setSpeaker(on);
  storage.set('bleepr.speaker', on);
  renderHeader();
});

function renderHeader() {
  const pr = p();
  if (document.activeElement !== nameInput) nameInput.value = pr.name;
  if (document.activeElement !== bpmInput) bpmInput.value = pr.bpm;
  bpmInput.min = minBpmFor(pr.measures);
  $('#measures').textContent = pr.measures;
  $('#loop-secs').textContent = `${loopSeconds(pr.measures, pr.bpm).toFixed(1)} s`;
  $('#bpm-down').disabled = pr.bpm <= minBpmFor(pr.measures);
  $('#bpm-up').disabled = pr.bpm >= BPM_MAX;
  $('#meas-down').disabled = pr.measures <= MEASURES_MIN;
  const upOk = pr.measures < MEASURES_MAX && fitsLimit(pr.measures + 1, pr.bpm);
  $('#meas-up').disabled = !upOk;
  $('#meas-up').title = upOk ? 'More measures' : (pr.measures >= MEASURES_MAX ? `Up to ${MEASURES_MAX} measures` : `Over ${MAX_SECONDS} s. Raise the tempo first.`);
  speakerBtn.setAttribute('aria-pressed', String(engine.speaker));
  $('#dirty').hidden = !store.dirty;
  $('#btn-undo').disabled = $('#btn-undo-m').disabled = !store.canUndo();
  $('#btn-redo').disabled = $('#btn-redo-m').disabled = !store.canRedo();
  $('#menu-speaker').setAttribute('aria-checked', String(engine.speaker));
  document.title = `${pr.name} · Bleepr`;
}

// ---------- layers ----------
const list = $('#layer-list');
let layerSig = '';

function layerRowHtml(l) {
  const n = esc(l.name);
  return `
    <li class="layer-row" data-id="${l.id}">
      <button type="button" class="btn layer-select" data-act="select" aria-pressed="false">
        <span class="swatch bg-layer-${l.color}" aria-hidden="true">${l.color}</span>
        <span class="layer-names"><span class="layer-name"></span><span class="layer-chip-sub"></span></span>
        <span class="editing-tag">${icon('edit')}<span>Editing</span></span>
      </button>
      <button type="button" class="btn chip-pill" data-act="chip" title="Change chip and sound">
        <span class="chip-pill-name"></span>${icon('tune')}
      </button>
      <button type="button" class="btn icon-btn toggle" data-act="mute" aria-pressed="false" title="Mute">${icon('volume_up')}</button>
      <button type="button" class="btn icon-btn toggle" data-act="solo" aria-pressed="false" title="Solo">${icon('headphones')}</button>
      <input type="range" class="range vol" data-act="vol" min="0" max="100" step="1" aria-label="Volume for ${n}" title="Volume">
      <button type="button" class="btn icon-btn danger-hover" data-act="delete" aria-label="Delete ${n}" title="Delete layer">${icon('delete')}</button>
    </li>`;
}

function renderLayers() {
  const pr = p();
  const sig = pr.layers.map((l) => `${l.id}:${l.color}`).join('|');
  if (sig !== layerSig) {
    list.innerHTML = pr.layers.map(layerRowHtml).join('');
    layerSig = sig;
  }
  for (const l of pr.layers) {
    const row = list.querySelector(`[data-id="${l.id}"]`);
    const active = l.id === pr.activeLayerId;
    const chip = getPreset(l.presetId).name;
    row.classList.toggle('is-active', active);
    const sel = row.querySelector('[data-act="select"]');
    sel.setAttribute('aria-pressed', String(active));
    sel.setAttribute('aria-label', `${l.name}, ${chip}${active ? ', editing' : ''}`);
    row.querySelector('.layer-name').textContent = l.name;
    row.querySelector('.chip-pill-name').textContent = chip;
    row.querySelector('.layer-chip-sub').textContent = chip;
    row.querySelector('[data-act="chip"]').setAttribute('aria-label', `Chip for ${l.name}: ${chip}. Change`);
    const mute = row.querySelector('[data-act="mute"]');
    mute.setAttribute('aria-pressed', String(l.mute));
    mute.setAttribute('aria-label', `Mute ${l.name}`);
    mute.querySelector('.material-symbols-outlined').textContent = l.mute ? 'volume_off' : 'volume_up';
    const solo = row.querySelector('[data-act="solo"]');
    solo.setAttribute('aria-pressed', String(l.solo));
    solo.setAttribute('aria-label', `Solo ${l.name}`);
    const vol = row.querySelector('[data-act="vol"]');
    if (document.activeElement !== vol) vol.value = Math.round(l.volume * 100);
    vol.setAttribute('aria-label', `Volume for ${l.name}`);
    const del = row.querySelector('[data-act="delete"]');
    del.disabled = pr.layers.length <= 1;
    del.setAttribute('aria-label', `Delete ${l.name}`);
    del.title = pr.layers.length <= 1 ? "The last layer can't be deleted" : 'Delete layer';
  }
  $('#layer-count').textContent = `${pr.layers.length} of ${MAX_LAYERS}`;
  const add = $('#btn-add-layer');
  add.disabled = pr.layers.length >= MAX_LAYERS;
  add.title = add.disabled ? `Up to ${MAX_LAYERS} layers` : 'Add layer';
  renderLayersToggle();
}

// Phones: the list collapses to the layer being edited.
const layersEl = $('#layers');
const layersToggle = $('#layers-toggle');
const phone = matchMedia('(max-width: 767px)');
let layersOpen = false;
function renderLayersToggle() {
  const n = p().layers.length;
  layersEl.classList.toggle('collapsed', !layersOpen);
  layersToggle.hidden = n <= 1;
  layersToggle.setAttribute('aria-expanded', String(layersOpen));
  layersToggle.querySelector('.material-symbols-outlined').textContent = layersOpen ? 'expand_less' : 'expand_more';
  layersToggle.querySelector('.toggle-text').textContent = layersOpen ? 'Show less' : `Show all ${n}`;
  layersToggle.setAttribute('aria-label', layersOpen ? 'Show only the layer you are editing' : `Show all ${n} layers`);
}
function setLayersOpen(open) {
  layersOpen = open;
  renderLayersToggle();
}
layersToggle.addEventListener('click', () => setLayersOpen(!layersOpen));

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.layer-row').dataset.id;
  const layer = p().layers.find((l) => l.id === id);
  if (!layer) return;
  switch (btn.dataset.act) {
    case 'select':
      if (p().activeLayerId !== id) store.update((pr) => { pr.activeLayerId = id; }, { history: false, dirty: false, reason: 'layer-select' });
      if (phone.matches && layersOpen) setLayersOpen(false);
      break;
    case 'chip': openChip('edit', id); break;
    case 'mute':
      store.update((pr) => { const l = pr.layers.find((x) => x.id === id); l.mute = !l.mute; }, { history: false, reason: 'mix' });
      engine.updateMix();
      break;
    case 'solo':
      store.update((pr) => { const l = pr.layers.find((x) => x.id === id); l.solo = !l.solo; }, { history: false, reason: 'mix' });
      engine.updateMix();
      break;
    case 'delete': {
      if (p().layers.length <= 1) return;
      const name = layer.name;
      store.update((pr) => {
        const i = pr.layers.findIndex((x) => x.id === id);
        pr.layers.splice(i, 1);
        if (pr.activeLayerId === id) pr.activeLayerId = pr.layers[Math.max(0, i - 1)].id;
      }, { reason: 'layers' });
      engine.updateMix();
      toast(`Deleted ${name}`, undoAction);
      break;
    }
    default:
  }
});
list.addEventListener('input', (e) => {
  if (e.target.dataset.act !== 'vol') return;
  const id = e.target.closest('.layer-row').dataset.id;
  const v = Number(e.target.value) / 100;
  store.update((pr) => { pr.layers.find((x) => x.id === id).volume = v; }, { history: false, reason: 'mix' });
  engine.updateMix();
});

$('#btn-add-layer').addEventListener('click', () => openChip('add'));

// ---------- chip picker ----------
const chipDlg = $('#dlg-chip');
const chipOptions = $('#chip-options');
chipOptions.innerHTML = PRESETS.map((pr) => `
  <label class="chip-item">
    <input type="radio" name="chip" value="${pr.id}">
    <span class="chip-text"><span class="chip-name">${esc(pr.name)}</span><span class="chip-desc">${esc(pr.desc)}</span></span>
    <button type="button" class="btn icon-btn chip-preview" data-preview="${pr.id}" aria-label="Preview ${esc(pr.name)}" title="Preview">${icon('play_circle')}</button>
  </label>`).join('');
const gritIn = $('#chip-grit'), brightIn = $('#chip-bright');
let chipMode = 'add', chipLayerId = null;

function chipParams() { return { grit: Number(gritIn.value) / 100, bright: Number(brightIn.value) / 100 }; }
function chipSelected() { return chipOptions.querySelector('input:checked')?.value || PRESETS[0].id; }
function syncSliderText() {
  $('#chip-grit-out').textContent = gritIn.value;
  $('#chip-bright-out').textContent = brightIn.value;
}

function openChip(mode, layerId = null) {
  chipMode = mode;
  chipLayerId = layerId;
  const layer = layerId ? p().layers.find((l) => l.id === layerId) : null;
  $('#chip-title').textContent = mode === 'add' ? 'Add layer' : `Sound for ${layer.name}`;
  $('#chip-name-row').hidden = mode === 'add';
  $('#chip-cancel').hidden = mode !== 'add';
  $('#chip-ok').textContent = mode === 'add' ? 'Add layer' : 'Done';
  const preset = layer ? layer.presetId : PRESETS[0].id;
  for (const r of chipOptions.querySelectorAll('input')) r.checked = r.value === preset;
  gritIn.value = Math.round((layer ? layer.params.grit : 0.5) * 100);
  brightIn.value = Math.round((layer ? layer.params.bright : 0.5) * 100);
  $('#chip-layer-name').value = layer ? layer.name : '';
  syncSliderText();
  chipDlg.returnValue = '';
  chipDlg.showModal();
  chipOptions.querySelector('input:checked')?.focus();
}

function editLayer(fn, coalesce) {
  if (chipMode !== 'edit') return;
  const id = chipLayerId;
  store.update((pr) => { const l = pr.layers.find((x) => x.id === id); if (l) fn(l); }, { coalesce, reason: 'sound' });
}

chipOptions.addEventListener('change', () => {
  const id = chipSelected();
  editLayer((l) => { l.presetId = id; }, null);
  engine.previewPreset(id, chipParams());
});
chipOptions.addEventListener('click', (e) => {
  const b = e.target.closest('[data-preview]');
  if (!b) return;
  e.preventDefault();
  const layer = chipLayerId ? p().layers.find((l) => l.id === chipLayerId) : null;
  engine.previewPreset(b.dataset.preview, chipParams(), layer ? layer.volume : 0.8);
});
for (const [input, key] of [[gritIn, 'grit'], [brightIn, 'bright']]) {
  input.addEventListener('input', () => {
    syncSliderText();
    const v = Number(input.value) / 100;
    editLayer((l) => { l.params[key] = v; }, `${key}-${chipLayerId}`);
  });
  input.addEventListener('change', () => engine.previewPreset(chipSelected(), chipParams()));
}
$('#chip-layer-name').addEventListener('input', (e) => {
  const v = e.target.value;
  editLayer((l) => { l.name = cleanName(v, l.name); }, `name-${chipLayerId}`);
});
chipDlg.addEventListener('close', () => {
  if (chipMode === 'add' && chipDlg.returnValue === 'ok') {
    if (p().layers.length >= MAX_LAYERS) return;
    const presetId = chipSelected();
    const params = chipParams();
    store.update((pr) => {
      const layer = createLayer(presetId, pr.layers);
      layer.params = params;
      pr.layers.push(layer);
      pr.activeLayerId = layer.id;
    }, { reason: 'layers' });
    setLayersOpen(false);
    announce(`Added ${store.activeLayer.name} with ${getPreset(presetId).name}. Now editing it.`);
  }
});

// ---------- toolbar ----------
const playBtn = $('#btn-play');
function renderTransport() {
  const on = engine.playing;
  playBtn.querySelector('.material-symbols-outlined').textContent = on ? 'stop' : 'play_arrow';
  playBtn.setAttribute('aria-label', on ? 'Stop' : 'Play');
  playBtn.title = on ? 'Stop (Space)' : 'Play (Space)';
  $('#btn-loop').setAttribute('aria-pressed', String(engine.loop));
}
let rafId = 0;
function followPlayhead() {
  if (!engine.playing) { roll.setPlayhead(null); rafId = 0; return; }
  roll.setPlayhead(engine.playheadStep());
  rafId = requestAnimationFrame(followPlayhead);
}
function togglePlay() {
  if (engine.playing) engine.stop();
  else {
    engine.play();
    if (!rafId) rafId = requestAnimationFrame(followPlayhead);
  }
  renderTransport();
}
engine.onStop = () => renderTransport();
playBtn.addEventListener('click', togglePlay);
$('#btn-loop').addEventListener('click', () => { engine.loop = !engine.loop; renderTransport(); });

const toolBtns = [...document.querySelectorAll('[data-tool]')];
function setTool(t) {
  roll.setTool(t);
  for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  $('#btn-delete').disabled = roll.selection.size === 0;
}
for (const b of toolBtns) b.addEventListener('click', () => setTool(b.dataset.tool));
$('#snap').addEventListener('change', (e) => roll.setSnap(Number(e.target.value)));
$('#btn-delete').addEventListener('click', () => roll.deleteSelection());
for (const id of ['#btn-undo', '#btn-undo-m']) $(id).addEventListener('click', () => store.undo());
for (const id of ['#btn-redo', '#btn-redo-m']) $(id).addEventListener('click', () => store.redo());

// ---------- phone menu ----------
const menuBtn = $('#btn-menu'), menuPanel = $('#menu-panel'), menuBackdrop = $('#menu-backdrop');
const menuItems = [...menuPanel.querySelectorAll('.menu-item')];
function openMenu() {
  menuPanel.hidden = menuBackdrop.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  menuItems[0].focus();
}
function closeMenu(refocus = true) {
  if (menuPanel.hidden) return;
  menuPanel.hidden = menuBackdrop.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  if (refocus) menuBtn.focus();
}
menuBtn.addEventListener('click', () => (menuPanel.hidden ? openMenu() : closeMenu()));
menuBackdrop.addEventListener('click', () => closeMenu());
menuPanel.addEventListener('click', (e) => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  closeMenu(item.id === 'menu-speaker');
  $('#' + item.dataset.proxy).click();
});
menuPanel.addEventListener('keydown', (e) => {
  const i = menuItems.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); menuItems[(i + 1) % menuItems.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); menuItems[(i - 1 + menuItems.length) % menuItems.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); menuItems[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); menuItems.at(-1).focus(); }
  else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
});

// ---------- share and import ----------
const shareDlg = $('#dlg-share');
const shareOut = $('#share-out');
const importText = $('#import-text');
let importParsed = null;

async function copyText(text, label) {
  shareOut.value = text;
  shareOut.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    shareOut.focus();
    shareOut.select();
    toast('Copying was blocked. The text is selected below; copy it with Ctrl+C or Cmd+C.');
  }
}
$('#btn-share').addEventListener('click', () => {
  $('#copy-rtttl-desc').textContent = `Active layer only (${store.activeLayer.name}). Works in most ringtone tools.`;
  shareOut.hidden = true;
  renderImport();
  shareDlg.showModal();
});
$('#copy-rtttl').addEventListener('click', () => copyText(layerToRTTTL(p(), store.activeLayer), 'RTTTL'));
$('#copy-full').addEventListener('click', () => copyText(encodeWrapper(p()), 'Full tune'));
$('#copy-link').addEventListener('click', () => {
  const url = location.href.split('#')[0] + toHash(encodeWrapper(p()));
  copyText(url, 'Link');
});

// Parse whatever is in the import box.
function parseImport(text) {
  if (!text.trim()) return null;
  if (isWrapper(text)) {
    const r = decodeWrapper(text);
    return { kind: 'wrapper', ok: r.ok, project: r.project, warnings: r.warnings, error: r.error };
  }
  const r = parseRTTTL(text);
  return {
    kind: 'rtttl', ok: r.ok, rtttl: r,
    warnings: r.warnings.map((w) => `Character ${w.pos}: ${w.message}`),
    error: r.error ? `Character ${r.error.pos}: ${r.error.message}` : null,
  };
}

function renderImport() {
  const res = (importParsed = parseImport(importText.value));
  const out = $('#import-result');
  const addBtn = $('#import-add'), repBtn = $('#import-replace');
  addBtn.textContent = 'Add as new layer';
  if (!res) { out.innerHTML = ''; addBtn.disabled = repBtn.disabled = true; return; }
  let html = '';
  if (!res.ok) html += `<p class="err">${icon('error')}<span>${esc(res.error)}</span></p>`;
  else if (res.kind === 'rtttl') {
    const r = res.rtttl;
    const m = Math.max(1, Math.ceil(r.totalSteps / STEPS_PER_MEASURE));
    html += `<p class="okmsg">${icon('check_circle')}<span>RTTTL “${esc(r.name || 'untitled')}”: ${r.notes.length} notes, ${r.bpm} BPM, ${m} measure${m === 1 ? '' : 's'}.</span></p>`;
  } else {
    const pr = res.project;
    html += `<p class="okmsg">${icon('check_circle')}<span>Full tune “${esc(pr.name)}”: ${pr.layers.length} layer${pr.layers.length === 1 ? '' : 's'}, ${pr.bpm} BPM, ${pr.measures} measures.</span></p>`;
  }
  if (res.warnings.length) html += `<ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  out.innerHTML = html;
  repBtn.disabled = !res.ok;
  const room = MAX_LAYERS - p().layers.length;
  const needed = res.ok ? (res.kind === 'wrapper' ? res.project.layers.length : 1) : 1;
  if (res.kind === 'wrapper' && needed > 1) addBtn.textContent = `Add as ${needed} new layers`;
  addBtn.disabled = !res.ok || needed > room;
  addBtn.title = needed > room ? `Only ${MAX_LAYERS} layers allowed (${room} free)` : '';
}
let importTimer = 0;
importText.addEventListener('input', () => { clearTimeout(importTimer); importTimer = setTimeout(renderImport, 150); });

// Measures for an imported RTTTL: round up to whole measures, within the limits.
function measuresFor(steps, bpm) {
  return clamp(Math.ceil(steps / STEPS_PER_MEASURE) || 1, MEASURES_MIN, maxMeasuresFor(bpm));
}

$('#import-replace').addEventListener('click', async () => {
  const res = importParsed;
  if (!res || !res.ok) return;
  if (!(await okToReplace('Replace it with the imported tune?'))) return;
  if (res.kind === 'wrapper') {
    store.replace(res.project, { dirty: true });
  } else {
    const r = res.rtttl;
    const pr = createProject();
    pr.name = cleanName(r.name, 'Imported');
    pr.bpm = r.bpm;
    pr.measures = measuresFor(r.totalSteps, r.bpm);
    const total = pr.measures * STEPS_PER_MEASURE;
    if (r.totalSteps > total) toast(`The tune was cut to ${pr.measures} measures (${MAX_SECONDS} s limit).`);
    pr.layers[0].name = cleanName(r.name, 'Layer 1');
    pr.layers[0].notes = insertNotes([], r.notes, total);
    store.replace(pr, { dirty: true });
  }
  shareDlg.close();
  importText.value = '';
  announce(`Imported ${p().name}.`);
});

$('#import-add').addEventListener('click', () => {
  const res = importParsed;
  if (!res || !res.ok) return;
  // Project BPM is kept; notes are placed by step, so timing stays relative.
  const incoming = res.kind === 'wrapper'
    ? res.project.layers.map((l) => ({ name: l.name, presetId: l.presetId, params: l.params, volume: l.volume, notes: l.notes, steps: res.project.measures * STEPS_PER_MEASURE }))
    : [{ name: res.rtttl.name, presetId: store.activeLayer.presetId, params: { grit: 0.5, bright: 0.5 }, volume: 0.8, notes: res.rtttl.notes, steps: res.rtttl.totalSteps }];
  if (p().layers.length + incoming.length > MAX_LAYERS) return;
  const longest = Math.max(...incoming.map((x) => x.steps));
  let cut = false;
  store.update((pr) => {
    const want = Math.max(pr.measures, measuresFor(longest, pr.bpm));
    if (want > pr.measures) pr.measures = want;
    const total = pr.measures * STEPS_PER_MEASURE;
    for (const x of incoming) {
      const layer = createLayer(x.presetId, pr.layers, x.name || undefined);
      layer.params = { ...x.params };
      layer.volume = x.volume;
      if (x.notes.some((n) => n.start + n.length > total)) cut = true;
      layer.notes = insertNotes([], x.notes, total);
      pr.layers.push(layer);
      pr.activeLayerId = layer.id;
    }
  }, { reason: 'layers' });
  shareDlg.close();
  importText.value = '';
  toast(cut ? `Added. Notes past measure ${p().measures} were cut.` : `Added ${incoming.length === 1 ? 'a layer' : incoming.length + ' layers'}.`, undoAction);
});

// Paste a share link or text anywhere outside text fields: offer to import.
document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const text = e.clipboardData?.getData('text') || '';
  const fromLink = fromHash(text.slice(text.indexOf('#'))) ;
  const value = fromLink || text;
  if (!value.trim()) return;
  if (!isWrapper(value) && !/:\s*[dob]\s*=/.test(value) && !/^[^:]*:[^:]*:/.test(value)) return;
  e.preventDefault();
  importText.value = value;
  $('#btn-share').click();
});

// ---------- export ----------
const exportDlg = $('#dlg-export');
let repeats = 1;
function maxRepeats() { return Math.max(1, Math.floor((MAX_SECONDS + 1e-9) / loopSeconds(p().measures, p().bpm))); }
function renderExport() {
  const secs = loopSeconds(p().measures, p().bpm);
  repeats = clamp(repeats, 1, maxRepeats());
  $('#export-summary').textContent = `${p().name}.wav · loop ${secs.toFixed(2)} s · 16-bit PCM, 44.1 kHz, mono`;
  $('#rep-val').textContent = repeats;
  $('#rep-total').textContent = `${(secs * repeats).toFixed(1)} s total (max ${maxRepeats()})`;
  $('#rep-down').disabled = repeats <= 1;
  $('#rep-up').disabled = repeats >= maxRepeats();
  const fade = $('#fade-on').checked;
  $('#fade-len').disabled = !fade;
  $('#fade-warn').hidden = !fade;
  $('#export-speaker').hidden = !engine.speaker;
}
$('#btn-export').addEventListener('click', () => { $('#export-status').textContent = ''; renderExport(); exportDlg.showModal(); });
$('#rep-down').addEventListener('click', () => { repeats--; renderExport(); });
$('#rep-up').addEventListener('click', () => { repeats++; renderExport(); });
$('#fade-on').addEventListener('change', renderExport);

function fileName() {
  const base = p().name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Bleepr';
  return `${base}.wav`;
}

async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: 'audio/wav' });
  const mobile = matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return 'downloaded';
}

$('#export-go').addEventListener('click', async () => {
  const btn = $('#export-go');
  const status = $('#export-status');
  const fade = $('#fade-on').checked ? Number($('#fade-len').value) : 0;
  btn.disabled = true;
  status.textContent = 'Rendering…';
  try {
    const { samples, sampleRate } = await renderTune(p(), { repeats, fade, speaker: engine.speaker });
    const blob = encodeWav(samples, sampleRate);
    const name = fileName();
    const how = await deliver(blob, name);
    status.textContent = how === 'cancelled' ? 'Sharing was cancelled.' : `${name} is ready (${(blob.size / 1024).toFixed(0)} KB).`;
  } catch (err) {
    console.error(err);
    status.textContent = `Export failed: ${err && err.message ? err.message : 'unknown error'}. Try fewer repeats.`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- my tunes ----------
const tunesDlg = $('#dlg-tunes');
const fmtDate = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
let renamingId = null;

function renderTunes() {
  $('#tunes-current').textContent = p().name;
  $('#tunes-current-state').textContent = store.dirty ? (store.savedId ? 'Unsaved changes' : 'Not saved yet') : 'Saved';
  const tunes = store.listTunes();
  const ul = $('#tunes-list');
  if (!tunes.length) ul.innerHTML = '<li class="tune-empty">No saved tunes yet. Save the current tune to keep it here.</li>';
  else ul.innerHTML = tunes.map((t) => {
    if (t.id === renamingId) {
      return `<li class="tune-row" data-id="${t.id}">
        <label for="rename-${t.id}" class="sr-only">New name</label>
        <input id="rename-${t.id}" class="text-input bg-bg text-fg border border-border" maxlength="10" value="${esc(t.name)}">
        <button type="button" class="btn text-btn primary" data-tact="rename-save">Rename</button>
        <button type="button" class="btn icon-btn" data-tact="rename-cancel" aria-label="Cancel rename" title="Cancel">${icon('close')}</button>
      </li>`;
    }
    const current = t.id === store.savedId;
    return `<li class="tune-row" data-id="${t.id}">
      <button type="button" class="btn tune-open" data-tact="open">
        <span class="tune-title">${esc(t.name)}${current ? ' <span class="tune-meta">(open)</span>' : ''}</span>
        <span class="tune-meta">${t.project?.layers?.length || 1} layer${(t.project?.layers?.length || 1) === 1 ? '' : 's'} · ${fmtDate(t.savedAt)}</span>
      </button>
      <button type="button" class="btn icon-btn" data-tact="rename" aria-label="Rename ${esc(t.name)}" title="Rename">${icon('edit')}</button>
      <button type="button" class="btn icon-btn danger-hover" data-tact="delete" aria-label="Delete ${esc(t.name)}" title="Delete">${icon('delete')}</button>
    </li>`;
  }).join('');
  $('#examples-list').innerHTML = EXAMPLES.map((ex) => `
    <li class="tune-row" data-ex="${ex.id}">
      <button type="button" class="btn tune-open" data-tact="example">
        <span class="tune-title">${esc(ex.title)}</span><span class="tune-meta">${esc(ex.note)}</span>
      </button>
    </li>`).join('');
  const input = ul.querySelector('input');
  if (input) { input.focus(); input.select(); }
}

$('#btn-tunes').addEventListener('click', () => { renamingId = null; renderTunes(); tunesDlg.showModal(); });
$('#tunes-save').addEventListener('click', () => {
  if (store.saveCurrent()) toast(`Saved "${p().name}"`);
  else toast("Couldn't save. Browser storage may be full or blocked.");
  renderTunes();
});
$('#tunes-new').addEventListener('click', async () => {
  if (!(await okToReplace('Start a new tune anyway?'))) return;
  store.replace(createProject(), { dirty: false });
  tunesDlg.close();
  toast('New tune', undoAction);
});
tunesDlg.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-tact]');
  if (!b) return;
  const row = b.closest('.tune-row');
  const id = row.dataset.id;
  switch (b.dataset.tact) {
    case 'open':
      if (id === store.savedId && !store.dirty) { tunesDlg.close(); return; }
      if (!(await okToReplace('Open the other tune anyway?'))) return;
      store.openTune(id);
      tunesDlg.close();
      break;
    case 'example': {
      const ex = EXAMPLES.find((x) => x.id === row.dataset.ex);
      if (!(await okToReplace('Open the example anyway?'))) return;
      const res = decodeWrapper(ex.text);
      if (res.ok) store.replace(res.project, { dirty: false });
      tunesDlg.close();
      break;
    }
    case 'rename': renamingId = id; renderTunes(); break;
    case 'rename-cancel': renamingId = null; renderTunes(); break;
    case 'rename-save': {
      const v = row.querySelector('input').value;
      store.renameTune(id, v);
      renamingId = null;
      renderTunes();
      break;
    }
    case 'delete': {
      const t = store.listTunes().find((x) => x.id === id);
      const answer = await ask('Delete tune?', `"${t?.name}" will be removed from My tunes. This can't be undone.`, [
        { value: 'cancel', label: 'Cancel' }, { value: 'delete', label: 'Delete', primary: true },
      ]);
      if (answer === 'delete') { store.deleteTune(id); renderTunes(); }
      break;
    }
    default:
  }
});
tunesDlg.addEventListener('keydown', (e) => {
  if (e.target.matches('.tune-row input')) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.closest('.tune-row').querySelector('[data-tact="rename-save"]').click(); }
    if (e.key === 'Escape') { e.preventDefault(); renamingId = null; renderTunes(); }
  }
});

// ---------- keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || !$('#tp-panel').hidden || !menuPanel.hidden) return;
  const t = e.target;
  const typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'z' || e.key === 'Z')) {
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) store.redo(); else store.undo();
    return;
  }
  if (mod && (e.key === 'y' || e.key === 'Y')) {
    if (typing) return;
    e.preventDefault();
    store.redo();
    return;
  }
  if (typing) return;
  if (e.key === ' ' && !mod) {
    e.preventDefault();
    togglePlay();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && t !== roll.canvas) {
    if (roll.deleteSelection()) e.preventDefault();
  }
});

// ---------- links with a tune in the hash ----------
async function loadFromHash() {
  const text = fromHash(location.hash);
  if (!text) return;
  history.replaceState(null, '', location.pathname + location.search);
  const res = decodeWrapper(text);
  if (!res.ok) { toast(`That link couldn't be opened: ${res.error}`); return; }
  if (!(await okToReplace(`Open the shared tune "${res.project.name}" instead?`))) return;
  store.replace(res.project, { dirty: true });
  toast(`Opened "${res.project.name}"`, undoAction);
}
window.addEventListener('hashchange', loadFromHash);

// ---------- render loop ----------
store.subscribe((reason) => {
  renderHeader();
  renderLayers();
  if (reason === 'replace' || reason === 'history' || reason === 'layers') engine.updateMix();
});

// First launch: open an example so the app shows what it does.
if (!storage.get('bleepr.current.v1') && !fromHash(location.hash)) {
  const res = decodeWrapper(EXAMPLES[2].text);
  if (res.ok) store.replace(res.project, { history: false, dirty: false });
}

renderHeader();
renderLayers();
renderTransport();
loadFromHash();
