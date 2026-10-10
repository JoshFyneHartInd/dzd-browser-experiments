'use strict';
const $ = (s) => document.querySelector(s);
const STRENGTH = [null, { cells: 6, label: 'Mild' }, { cells: 5, label: 'Medium' }, { cells: 4, label: 'Strong' }, { cells: 3, label: 'Stronger' }, { cells: 2, label: 'Maximum' }];
const MIN_BOX = 8;
const MODEL_URL = 'model/yunet-face.onnx';
const DEMO_URLS = ['images/demo-01.jpg', 'images/demo-02.jpg', 'images/demo-03.jpg', 'images/demo-04.jpg'];
const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
const SCOPE_NOTES = {
  face: 'Covers whole faces.',
  eyes: 'Only covers eyes.',
};

let items = [], curId = null, selected = -1, showOriginal = false, nextId = 1, drag = null;
const cur = () => items.find((i) => i.id === curId) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

/* A box is either
   - detected: { score, face: {x,y,w,h}, eyes: {x,y,w,h} } (image pixels; the Veil setting picks which rect is used), or
   - drawn by hand: { x,y,w,h, user: true } (used as drawn in both modes).
   rect() returns the live rectangle object so edits write straight through. */
const scopeNow = () => document.querySelector('input[name=scope]:checked').value;
const rect = (b, sc) => (b.user ? b : b[sc || scopeNow()]);

/* ---------- model loading ---------- */
function setModel(state, text) {
  $('#model').dataset.s = state;
  $('#modelTxt').textContent = state === 'init' ? 'Starting detector' : state === 'ready' ? (text || 'Detector ready') : state === 'error' ? (text || 'Detector failed to load') : (text || '');
}
let sessionPromise = null;
function getSession() {
  if (!sessionPromise) sessionPromise = makeSession().catch((e) => { sessionPromise = null; setModel('error', 'Detector failed: ' + (e.message || e)); throw e; });
  return sessionPromise;
}
async function makeSession() {
  if (typeof ort === 'undefined') throw new Error('onnxruntime-web did not load. Check your connection.');
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  setModel('init');
  const resp = await fetch(MODEL_URL);
  if (!resp.ok) throw new Error('Could not load ' + MODEL_URL + ' (HTTP ' + resp.status + ')');
  const buf = new Uint8Array(await resp.arrayBuffer());
  const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
  let size = 640;
  const meta = s.inputMetadata && s.inputMetadata[0];
  if (meta && meta.shape && +meta.shape[2] > 0) size = +meta.shape[2];
  s.imgSize = size;
  setModel('ready', 'Detector ready');
  return s;
}

/* ---------- detection ---------- */
// Model: YuNet face detector. Input 1x3xSxS, BGR, raw 0..255 (no scaling), letterboxed with black padding.
// Outputs for strides 8, 16 and 32: cls_*, obj_* [1,N,1], bbox_* [1,N,4] and kps_* [1,N,10] with N = (S/stride)^2.
// Score = sqrt(cls * obj). bbox = (dx, dy, log w, log h) from the cell's grid point. kps = five (dx, dy) landmarks:
// image-left eye, image-right eye, nose, mouth left, mouth right. NMS is done in JS.
async function detectRegion(sess, bmp, sx, sy, sw, sh) {
  const S = sess.imgSize, r = Math.min(S / sw, S / sh);
  const rw = Math.max(1, Math.round(sw * r)), rh = Math.max(1, Math.round(sh * r));
  const left = Math.floor((S - rw) / 2), top = Math.floor((S - rh) / 2);
  const c = mk(S, S), cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S);
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bmp, sx, sy, sw, sh, left, top, rw, rh);
  const px = cx.getImageData(0, 0, S, S).data, n = S * S, data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { data[i] = px[i * 4 + 2]; data[n + i] = px[i * 4 + 1]; data[2 * n + i] = px[i * 4]; }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, S, S]) });
  const rx = rw / sw, ry = rh / sh, res = [];
  const fx = (v) => sx + (v - left) / rx, fy = (v) => sy + (v - top) / ry;
  for (const st of [8, 16, 32]) {
    const cls = out['cls_' + st], obj = out['obj_' + st], bb = out['bbox_' + st], kp = out['kps_' + st];
    if (!cls || !obj || !bb || !kp) throw new Error('Unexpected model outputs');
    const cols = S / st;
    if (cls.dims[1] !== cols * cols) throw new Error('Unexpected model output shape [' + cls.dims.join(',') + ']');
    const C = cls.data, O = obj.data, B = bb.data, K = kp.data;
    for (let i = 0; i < cols * cols; i++) {
      const score = Math.sqrt(clamp(C[i], 0, 1) * clamp(O[i], 0, 1));
      if (score < 0.1) continue;
      const gy = Math.floor(i / cols), gx = i % cols, b = i * 4, k = i * 10;
      const bcx = (gx + B[b]) * st, bcy = (gy + B[b + 1]) * st, bw = Math.exp(B[b + 2]) * st, bh = Math.exp(B[b + 3]) * st;
      const x1 = fx(bcx - bw / 2), y1 = fy(bcy - bh / 2), x2 = fx(bcx + bw / 2), y2 = fy(bcy + bh / 2);
      const lm = [fx((K[k] + gx) * st), fy((K[k + 1] + gy) * st), fx((K[k + 2] + gx) * st), fy((K[k + 3] + gy) * st)];
      res.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score, lm });
    }
  }
  return res;
}
function iou(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return { iou: i / (a.w * a.h + b.w * b.h - i || 1), min: i / (Math.min(a.w * a.h, b.w * b.h) || 1) };
}
// Overlapping scan tiles can return a clipped face next to a whole one, so also drop boxes mostly inside a better one.
function nms(list, th) {
  list.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const d of list) if (keep.every((k) => { const o = iou(k, d); return o.iou < th && o.min < 0.7; })) keep.push(d);
  return keep;
}
const clampRect = (x, y, w, h, W, H) => {
  const x0 = clamp(x, 0, W), y0 = clamp(y, 0, H), x1 = clamp(x + w, 0, W), y1 = clamp(y + h, 0, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
// Eye bar from the two eye landmarks. d = eye distance; the face box is about 2.4 d wide.
// If the landmarks look wrong for the face box, fall back to a strip across the upper face.
function eyeRect(d, face, W, H) {
  const [ax, ay, bx, by] = d.lm, dist = Math.hypot(bx - ax, by - ay);
  if (dist < 0.15 * face.w || dist > 0.8 * face.w || !isFinite(dist)) {
    return clampRect(face.x + 0.06 * face.w, face.y + 0.32 * face.h, 0.88 * face.w, 0.24 * face.h, W, H);
  }
  const x0 = Math.min(ax, bx) - 0.36 * dist, x1 = Math.max(ax, bx) + 0.36 * dist;
  const y0 = Math.min(ay, by) - 0.36 * dist, y1 = Math.max(ay, by) + 0.26 * dist;
  return clampRect(x0, y0, x1 - x0, y1 - y0, W, H);
}
async function detect(item, thorough) {
  const sess = await getSession();
  const W = item.w, H = item.h;
  const regions = [[0, 0, W, H]];
  if (thorough) {
    // Faces in big photos shrink a lot at 640 px, so also scan overlapping crops at two zoom levels.
    for (const fy of [0, 0.4]) for (const fx of [0, 0.4]) regions.push([fx * W, fy * H, W * 0.6, H * 0.6]);
    for (const fy of [0, 0.3, 0.6]) for (const fx of [0, 0.3, 0.6]) regions.push([fx * W, fy * H, W * 0.4, H * 0.4]);
  }
  let all = [];
  for (const r of regions) all = all.concat(await detectRegion(sess, item.bitmap, r[0], r[1], r[2], r[3]));
  return nms(all, 0.4).map((d) => {
    const face = clampRect(d.x, d.y, d.w, d.h, W, H);
    return { score: d.score, face, eyes: eyeRect(d, face, W, H) };
  }).filter((d) => d.face.w >= 2 && d.face.h >= 2 && d.eyes.w >= 2 && d.eyes.h >= 2);
}

/* ---------- queue ---------- */
let chain = Promise.resolve();
function enqueue(item) {
  item.status = 'queued'; renderList();
  chain = chain.then(() => runDetect(item)).catch(() => {});
}
async function runDetect(item) {
  if (!items.includes(item)) return;
  item.status = 'running'; renderList(); if (item === cur()) updateBar();
  try {
    const dets = await detect(item, $('#thorough').checked);
    item.boxes = item.boxes.filter((b) => b.user).concat(dets);
    item.status = 'done';
  } catch (e) { item.status = 'error'; item.error = e.message || String(e); }
  renderList(); updateWarn();
  if (item === cur()) { selected = -1; render(); updateBar(); }
}

/* ---------- settings and obscuring ---------- */
function settings() {
  return {
    scope: scopeNow(),
    method: document.querySelector('input[name=method]:checked').value,
    color: $('#color').value,
    strength: +$('#strength').value,
    pad: +$('#pad').value / 100,
    thr: +$('#thr').value / 100,
  };
}
const visible = (b, thr) => b.user || b.pinned || b.score >= thr;
function shrink(src, sx, sy, sw, sh, tw, th) {
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / 2 > tw || ch / 2 > th) {
    const nw = Math.max(tw, Math.ceil(cw / 2)), nh = Math.max(th, Math.ceil(ch / 2));
    const c = mk(nw, nh), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
    cur = c; cx = 0; cy = 0; cw = nw; ch = nh;
  }
  const c = mk(tw, th), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, cx, cy, cw, ch, 0, 0, tw, th);
  return c;
}
// ref is the height the strength setting is measured against: the face height for detected boxes
// (so an eye bar pixelates as coarsely as a whole face would), or the box's own height for boxes drawn by hand.
function obscure(ctx, x, y, w, h, st, ref) {
  if (w < 1 || h < 1) return;
  if (st.method === 'solid') { ctx.fillStyle = st.color; ctx.fillRect(x, y, w, h); return; }
  const cells = STRENGTH[st.strength].cells, block = Math.max(1, ref / cells);
  const tw = Math.max(1, Math.round(w / block)), th = Math.max(1, Math.round(h / block));
  const small = shrink(ctx.canvas, x, y, w, h, tw, th);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = st.method === 'blur';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, x, y, w, h);
  ctx.restore();
}
function paint(ctx, it, orig) {
  const W = ctx.canvas.width, H = ctx.canvas.height, k = W / it.w;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(it.bitmap, 0, 0, W, H);
  if (orig) return;
  const st = settings();
  for (const b of it.boxes) {
    if (!visible(b, st.thr)) continue;
    const r = rect(b, st.scope), px = r.w * st.pad, py = r.h * st.pad;
    const x0 = clamp(Math.floor((r.x - px) * k), 0, W), y0 = clamp(Math.floor((r.y - py) * k), 0, H);
    const x1 = clamp(Math.ceil((r.x + r.w + px) * k), 0, W), y1 = clamp(Math.ceil((r.y + r.h + py) * k), 0, H);
    obscure(ctx, x0, y0, x1 - x0, y1 - y0, st, (b.user ? r.h : b.face.h) * k);
  }
}
function drawUI(ctx, it) {
  const cv = ctx.canvas, r = cv.getBoundingClientRect(), k = cv.width / it.w, px = cv.width / (r.width || cv.width);
  const col = getComputedStyle(document.documentElement).getPropertyValue('--box').trim() || '#e11d48';
  const st = settings();
  it.boxes.forEach((b, i) => {
    if (!visible(b, st.thr)) return;
    const g = rect(b, st.scope), sel = i === selected;
    ctx.lineWidth = (sel ? 3 : 2) * px;
    ctx.strokeStyle = col;
    ctx.setLineDash(b.user ? [6 * px, 4 * px] : []);
    ctx.strokeRect(g.x * k, g.y * k, g.w * k, g.h * k);
    ctx.setLineDash([]);
    if (sel) {
      const hs = 5 * px;
      ctx.fillStyle = col;
      for (const hy of [0, 0.5, 1]) for (const hx of [0, 0.5, 1]) {
        if (hx === 0.5 && hy === 0.5) continue;
        ctx.fillRect((g.x + g.w * hx) * k - hs, (g.y + g.h * hy) * k - hs, hs * 2, hs * 2);
      }
    }
  });
}

/* ---------- rendering ---------- */
function render() {
  const it = cur(), cv = $('#cv');
  $('#empty').hidden = !!it; $('#work').hidden = !it;
  if (!it) return;
  const s = Math.min(1, 1600 / Math.max(it.w, it.h));
  const cw = Math.max(1, Math.round(it.w * s)), ch = Math.max(1, Math.round(it.h * s));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const ctx = cv.getContext('2d');
  paint(ctx, it, showOriginal);
  drawUI(ctx, it);
}
function statText(it) {
  if (it.status === 'queued') return 'Queued';
  if (it.status === 'running') return 'Scanning';
  if (it.status === 'error') return 'Scan failed';
  const n = it.boxes.filter((b) => visible(b, settings().thr)).length;
  return n ? n + (n === 1 ? ' face' : ' faces') : 'No boxes';
}
function renderList() {
  const box = $('#thumbs'); box.replaceChildren();
  for (const it of items) {
    const row = document.createElement('div'); row.className = 'thumb' + (it.id === curId ? ' on' : '');
    const sel = document.createElement('button'); sel.type = 'button'; sel.className = 'tsel'; sel.title = it.name;
    const img = new Image(); img.src = it.thumb; img.alt = '';
    const meta = document.createElement('span'); meta.className = 'tmeta';
    const nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = it.name;
    const stt = document.createElement('span'); stt.className = 'tstat'; stt.textContent = statText(it);
    if (it.status === 'error' || (it.status === 'done' && !it.boxes.some((b) => visible(b, settings().thr)))) stt.classList.add('zero');
    meta.append(nm, stt); sel.append(img, meta);
    sel.addEventListener('click', () => { curId = it.id; selected = -1; renderList(); render(); updateBar(); });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'tx'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + it.name);
    x.addEventListener('click', () => removeItem(it.id));
    row.append(sel, x); box.append(row);
  }
  $('#dlOne').disabled = !cur(); $('#dlAll').disabled = !items.length;
}
function updateBar() {
  const it = cur();
  if (!it) return;
  $('#fname').textContent = it.name;
  const n = it.boxes.filter((b) => visible(b, settings().thr)).length;
  let t = it.w + '×' + it.h + ' px';
  if (it.status === 'running') t += ' · scanning'; else if (it.status === 'queued') t += ' · queued';
  else if (it.status === 'error') t += ' · scan failed: ' + it.error;
  else t += ' · ' + n + (n === 1 ? ' box' : ' boxes');
  $('#fmeta').textContent = t;
  $('#delBox').disabled = selected < 0;
}
function updateWarn() {
  const w = $('#warn'), thr = settings().thr;
  const empty = items.filter((i) => i.status === 'done' && !i.boxes.some((b) => visible(b, thr))).length;
  const failed = items.filter((i) => i.status === 'error').length;
  const parts = [];
  if (empty) parts.push(empty + (empty === 1 ? ' photo has' : ' photos have') + ' no boxes. Check ' + (empty === 1 ? 'it' : 'them') + ' by eye. The detector can miss small, turned, masked or partly hidden faces.');
  if (failed) parts.push(failed + ' failed to scan. You can still draw boxes by hand.');
  w.hidden = !parts.length; w.textContent = parts.join(' ');
}
function refreshAll() { renderList(); render(); updateBar(); updateWarn(); }

/* ---------- files ---------- */
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { return await createImageBitmap(file); }
}
function makeThumb(bmp) {
  const s = 96 / Math.max(bmp.width, bmp.height), c = mk(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) { $('#msg').textContent = 'No image files found.'; return; }
  let first = null, failed = [];
  for (const f of list) {
    try {
      const bmp = await loadBitmap(f);
      const it = { id: nextId++, name: f.name || 'pasted-image.png', type: f.type, bitmap: bmp, w: bmp.width, h: bmp.height, boxes: [], status: 'queued', thumb: makeThumb(bmp) };
      items.push(it); first = first || it; enqueue(it);
    } catch (e) { failed.push(f.name); }
  }
  if (first) { curId = first.id; selected = -1; }
  $('#msg').textContent = failed.length ? 'Could not open: ' + failed.join(', ') : '';
  refreshAll();
}
function removeItem(id) {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  items.splice(i, 1);
  if (curId === id) { curId = items.length ? items[Math.min(i, items.length - 1)].id : null; selected = -1; }
  refreshAll();
}

/* ---------- export ---------- */
async function exportItem(it, fmt) {
  const c = mk(it.w, it.h);
  paint(c.getContext('2d'), it, false);
  const blob = await new Promise((r) => c.toBlob(r, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92));
  if (!blob) throw new Error('Image too large for this browser to export');
  return blob;
}
const outName = (it, fmt) => it.name.replace(/\.[^.]+$/, '') + '-veiled.' + (fmt === 'jpeg' ? 'jpg' : 'png');
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#dlOne').addEventListener('click', async () => {
  const it = cur(); if (!it) return;
  try { const fmt = $('#fmt').value; save(await exportItem(it, fmt), outName(it, fmt)); $('#msg').textContent = 'Saved ' + outName(it, fmt); }
  catch (e) { $('#msg').textContent = e.message; }
});
$('#dlAll').addEventListener('click', async () => {
  if (!items.length) return;
  if (typeof JSZip === 'undefined') { $('#msg').textContent = 'ZIP library did not load.'; return; }
  const fmt = $('#fmt').value, zip = new JSZip(), used = new Set();
  try {
    let n = 0;
    for (const it of items) {
      $('#msg').textContent = 'Rendering ' + (++n) + ' of ' + items.length;
      let name = outName(it, fmt), k = 2;
      while (used.has(name)) name = outName(it, fmt).replace(/(\.\w+)$/, '-' + (k++) + '$1');
      used.add(name); zip.file(name, await exportItem(it, fmt));
    }
    save(await zip.generateAsync({ type: 'blob' }), 'autoveil-photos.zip');
    $('#msg').textContent = 'Saved autoveil-photos.zip';
  } catch (e) { $('#msg').textContent = e.message; }
});

/* ---------- canvas editing ---------- */
const cv = $('#cv');
function toImg(e) {
  const it = cur(), r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * it.w, y: ((e.clientY - r.top) / r.height) * it.h, k: it.w / r.width };
}
function handleAt(b, p, hs) {
  hs = Math.min(hs, 0.3 * Math.min(b.w, b.h)); // keep the middle of thin boxes (eye bars) grabbable for moving
  const xs = [['w', b.x], ['', b.x + b.w / 2], ['e', b.x + b.w]], ys = [['n', b.y], ['', b.y + b.h / 2], ['s', b.y + b.h]];
  for (const [hy, y] of ys) for (const [hx, x] of xs) {
    if (!hx && !hy) continue;
    if (Math.abs(p.x - x) <= hs && Math.abs(p.y - y) <= hs) return hy + hx;
  }
  return null;
}
function hit(it, p) {
  const thr = settings().thr, hs = 12 * p.k;
  if (selected >= 0 && it.boxes[selected] && visible(it.boxes[selected], thr)) {
    const h = handleAt(rect(it.boxes[selected]), p, hs);
    if (h) return { idx: selected, mode: 'resize', h };
  }
  for (let i = it.boxes.length - 1; i >= 0; i--) {
    const b = it.boxes[i];
    if (!visible(b, thr)) continue;
    const g = rect(b);
    if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h) return { idx: i, mode: 'move' };
  }
  return null;
}
cv.addEventListener('pointerdown', (e) => {
  const it = cur(); if (!it) return;
  cv.setPointerCapture(e.pointerId);
  const p = toImg(e), h = hit(it, p);
  if (h) {
    const g = rect(it.boxes[h.idx]); selected = h.idx;
    drag = { mode: h.mode, h: h.h, sx: p.x, sy: p.y, idx: h.idx, o: { x: g.x, y: g.y, w: g.w, h: g.h } };
  } else {
    it.boxes.push({ x: p.x, y: p.y, w: 0, h: 0, score: 1, user: true });
    selected = it.boxes.length - 1;
    drag = { mode: 'draw', sx: p.x, sy: p.y, idx: selected };
  }
  render(); updateBar();
});
cv.addEventListener('pointermove', (e) => {
  const it = cur(); if (!it) return;
  const p = toImg(e);
  if (!drag) {
    const h = hit(it, p);
    cv.style.cursor = h ? (h.mode === 'resize' ? CURSORS[h.h] : 'move') : 'crosshair';
    return;
  }
  const parent = it.boxes[drag.idx], b = rect(parent);
  if (drag.mode === 'move') {
    b.x = clamp(drag.o.x + p.x - drag.sx, 0, it.w - b.w); b.y = clamp(drag.o.y + p.y - drag.sy, 0, it.h - b.h); parent.pinned = true;
  } else if (drag.mode === 'draw') {
    const x0 = clamp(Math.min(drag.sx, p.x), 0, it.w), x1 = clamp(Math.max(drag.sx, p.x), 0, it.w);
    const y0 = clamp(Math.min(drag.sy, p.y), 0, it.h), y1 = clamp(Math.max(drag.sy, p.y), 0, it.h);
    b.x = x0; b.y = y0; b.w = x1 - x0; b.h = y1 - y0;
  } else {
    let x0 = drag.o.x, y0 = drag.o.y, x1 = x0 + drag.o.w, y1 = y0 + drag.o.h;
    if (drag.h.includes('w')) x0 = clamp(p.x, 0, x1 - MIN_BOX);
    if (drag.h.includes('e')) x1 = clamp(p.x, x0 + MIN_BOX, it.w);
    if (drag.h.includes('n')) y0 = clamp(p.y, 0, y1 - MIN_BOX);
    if (drag.h.includes('s')) y1 = clamp(p.y, y0 + MIN_BOX, it.h);
    b.x = x0; b.y = y0; b.w = x1 - x0; b.h = y1 - y0; parent.pinned = true;
  }
  render();
});
function endDrag() {
  const it = cur();
  if (drag && it && drag.mode === 'draw') {
    const b = it.boxes[drag.idx];
    if (b && (b.w < MIN_BOX || b.h < MIN_BOX)) { it.boxes.splice(drag.idx, 1); selected = -1; }
  }
  drag = null; render(); updateBar(); renderList(); updateWarn();
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

function deleteSelected() {
  const it = cur();
  if (!it || selected < 0) return;
  it.boxes.splice(selected, 1); selected = -1;
  render(); updateBar(); renderList(); updateWarn();
}
$('#delBox').addEventListener('click', deleteSelected);
window.addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  if (e.key === 'Escape') { selected = -1; render(); updateBar(); }
});
$('#cmp').addEventListener('click', (e) => { showOriginal = !showOriginal; e.currentTarget.setAttribute('aria-pressed', String(showOriginal)); render(); });
$('#rescan').addEventListener('click', () => { const it = cur(); if (it) { selected = -1; enqueue(it); } });

/* ---------- theme ---------- */
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { if (t === 'light' || t === 'dark') localStorage.setItem('av-theme', t); else localStorage.removeItem('av-theme'); } catch (e) {}
  if (cur()) render(); // box color follows the theme
}
(function () {
  const t = document.documentElement.dataset.theme || 'system';
  const r = document.querySelector('input[name=theme][value=' + t + ']'); if (r) r.checked = true;
  document.querySelectorAll('input[name=theme]').forEach((el) => el.addEventListener('change', () => applyTheme(el.value)));
})();

/* ---------- controls ---------- */
function syncControls() {
  const st = settings();
  $('#colorRow').hidden = st.method !== 'solid';
  $('#strRow').hidden = st.method === 'solid';
  $('#strOut').textContent = STRENGTH[st.strength].label;
  $('#strHint').hidden = !(st.method === 'blur' && st.strength < 3);
  $('#padOut').textContent = Math.round(st.pad * 100) + '%';
  $('#thrOut').textContent = Math.round(st.thr * 100) + '%';
  $('#scopeNote').textContent = SCOPE_NOTES[st.scope];
}
document.querySelectorAll('.ctrl input[type=radio], .ctrl input[type=range], #color').forEach((el) => {
  el.addEventListener('input', () => { syncControls(); refreshAll(); });
});

/* ---------- sample photos ---------- */
$('#demo').addEventListener('click', async (e) => {
  e.preventDefault(); // the button sits inside the drop label; don't open the file picker
  const btn = e.currentTarget; btn.disabled = true;
  try {
    const files = await Promise.all(DEMO_URLS.map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error('Could not load ' + url + ' (HTTP ' + r.status + ')');
      const blob = await r.blob();
      return new File([blob], url.split('/').pop(), { type: blob.type.startsWith('image/') ? blob.type : 'image/jpeg' });
    }));
    await addFiles(files);
  } catch (err) { $('#msg').textContent = err.message; }
  btn.disabled = false;
});

/* ---------- drop, paste, pick ---------- */
$('#file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); $('#addLabel').classList.add('over'); $('#empty').classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); $('#addLabel').classList.remove('over'); $('#empty').classList.remove('over'); }));
window.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (files.length) addFiles(files);
});
window.addEventListener('resize', () => { if (cur()) render(); });
// Redraw when the system theme flips so the box color follows it.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (cur()) render(); });

syncControls();
refreshAll();
