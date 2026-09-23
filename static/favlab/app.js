/* Favicon generator. Vanilla JS, no build step, everything runs in the browser. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config and state
  // ---------------------------------------------------------------------------
  const ICON_JSON_URL = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.json';
  const FONT_FAMILY = '"bootstrap-icons"';
  const SETTINGS_KEY = 'faviconGen:settings';
  const THEME_KEY = 'faviconGen:theme';
  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

  const DEFAULTS = {
    icon: 'star-fill',
    iconColor: '#ffffff',
    scale: 60,            // % of canvas (longest side of the glyph's ink)
    rotation: 0,          // degrees
    flipH: false,
    flipV: false,
    shape: 'circle',      // circle | rounded | square
    radius: 22,           // % of canvas, rounded square only
    bgColor: '#6366f1',
    bgTransparent: false,
    borderWidth: 0,       // % of canvas
    borderColor: '#ffffff',
    fillColor: null,      // null = follow bgColor (used by opaque exports when bg is transparent)
    manifest: { name: 'My Website', shortName: 'My Site', themeColor: null, backgroundColor: '#ffffff' }, // null theme = follow bgColor
  };

  const state = { ...DEFAULTS, manifest: { ...DEFAULTS.manifest } };
  let ICONS = new Map();   // name -> codepoint
  let NAMES = [];          // sorted A-Z
  let fontReady = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function normalizeHex(value) {
    const m = HEX_RE.exec(String(value).trim());
    if (!m) return null;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return '#' + h;
  }

  const fillColor = () => state.fillColor || state.bgColor;
  const themeColor = () => state.manifest.themeColor || state.bgColor;

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  function loadSettings() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) { return; }
    if (!saved || typeof saved !== 'object') return;
    const num = (v, min, max, d) => (typeof v === 'number' && v >= min && v <= max ? v : d);
    const hex = (v, d) => (typeof v === 'string' && normalizeHex(v)) || d;
    const hexOrNull = (v) => (typeof v === 'string' && normalizeHex(v)) || null;
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    const str = (v, d) => (typeof v === 'string' ? v.slice(0, 80) : d);

    state.icon = typeof saved.icon === 'string' ? saved.icon : state.icon;
    state.iconColor = hex(saved.iconColor, state.iconColor);
    state.scale = num(saved.scale, 10, 120, state.scale);
    state.rotation = num(saved.rotation, 0, 360, state.rotation);
    state.flipH = bool(saved.flipH, state.flipH);
    state.flipV = bool(saved.flipV, state.flipV);
    state.shape = ['circle', 'rounded', 'square'].includes(saved.shape) ? saved.shape : state.shape;
    state.radius = num(saved.radius, 0, 50, state.radius);
    state.bgColor = hex(saved.bgColor, state.bgColor);
    state.bgTransparent = bool(saved.bgTransparent, state.bgTransparent);
    state.borderWidth = num(saved.borderWidth, 0, 20, state.borderWidth);
    state.borderColor = hex(saved.borderColor, state.borderColor);
    state.fillColor = hexOrNull(saved.fillColor);
    const m = saved.manifest || {};
    state.manifest.name = str(m.name, state.manifest.name);
    state.manifest.shortName = str(m.shortName, state.manifest.shortName);
    state.manifest.themeColor = hexOrNull(m.themeColor);
    state.manifest.backgroundColor = hex(m.backgroundColor, state.manifest.backgroundColor);
  }

  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    }, 250);
  }

  // ---------------------------------------------------------------------------
  // Rendering: one function draws every preview and every export
  // ---------------------------------------------------------------------------

  // Path for the background shape, inset on all sides by `inset` px.
  function shapePath(ctx, S, inset) {
    const size = S - inset * 2;
    ctx.beginPath();
    if (state.shape === 'circle') {
      ctx.arc(S / 2, S / 2, size / 2, 0, Math.PI * 2);
      return;
    }
    const outerR = state.shape === 'rounded' ? (state.radius / 100) * S : 0;
    const r = Math.max(0, Math.min(outerR - inset, size / 2)); // keep the inset curve concentric with the outer one
    const x = inset, y = inset, w = size, h = size;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draws the glyph so its *ink* is centered, then rotates/flips around that center.
  function drawGlyph(ctx, S, safeZone) {
    const codepoint = ICONS.get(state.icon);
    if (!fontReady || codepoint === undefined) return;
    const ch = String.fromCodePoint(codepoint);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Measure at a reference size to learn the glyph's ink proportions.
    const REF = 200;
    ctx.font = `${REF}px ${FONT_FAMILY}`;
    let m = ctx.measureText(ch);
    const refW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const refH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const refMax = Math.max(refW, refH);
    if (!refMax) return;

    // Scale = longest side of the ink as a % of the canvas, so every icon looks the same size at the same setting.
    let fontSize = (REF * (state.scale / 100) * S) / refMax;

    if (safeZone) {
      // Maskable safe zone: keep the ink's bounding-box corners inside a circle of 80% of the canvas.
      // (Rotation about the center doesn't change corner distance, so this holds at any angle.)
      const half = Math.hypot(refW, refH) / 2 * (fontSize / REF);
      const limit = 0.4 * S;
      if (half > limit) fontSize *= limit / half;
    }

    // Re-measure at the real size and offset so the ink center lands on (0, 0).
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    m = ctx.measureText(ch);
    const ox = -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const oy = -(m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;

    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.fillStyle = state.iconColor;
    ctx.fillText(ch, ox, oy);
    ctx.restore();
  }

  /**
   * Draws the favicon natively at `size` px (never a downscale of something larger).
   * variant: 'icon'     your design: shape, transparency and border kept
   *          'full'     opaque full-bleed square (Apple touch)
   *          'maskable' opaque full-bleed square, glyph kept inside the safe zone
   * Draws into `target` if given, otherwise creates a canvas.
   */
  function render(size, { variant = 'icon' } = {}, target) {
    const canvas = target || document.createElement('canvas');
    canvas.width = size;   // also clears the canvas
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (variant === 'icon') {
      if (!state.bgTransparent) {
        shapePath(ctx, size, 0);
        ctx.fillStyle = state.bgColor;
        ctx.fill();
      }
      const t = (state.borderWidth / 100) * size;
      if (t > 0) {
        shapePath(ctx, size, t / 2); // stroke is centered on the path, so inset by half so it never clips
        ctx.lineWidth = t;
        ctx.strokeStyle = state.borderColor;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = state.bgTransparent ? fillColor() : state.bgColor;
      ctx.fillRect(0, 0, size, size);
    }

    drawGlyph(ctx, size, variant === 'maskable');
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // Export builders
  // ---------------------------------------------------------------------------
  const canvasToBlob = (canvas) =>
    new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode a PNG.'))), 'image/png'));

  // ICO = 6-byte header + 16-byte directory entry per image + the PNG data itself.
  async function buildIco(sizes = [16, 32, 48]) {
    const pngs = [];
    for (const s of sizes) pngs.push(new Uint8Array(await (await canvasToBlob(render(s))).arrayBuffer()));
    const headerLen = 6 + 16 * pngs.length;
    const buf = new ArrayBuffer(headerLen + pngs.reduce((n, p) => n + p.length, 0));
    const dv = new DataView(buf);
    const bytes = new Uint8Array(buf);
    dv.setUint16(0, 0, true);            // reserved
    dv.setUint16(2, 1, true);            // type: icon
    dv.setUint16(4, pngs.length, true);  // image count
    let offset = headerLen;
    pngs.forEach((png, i) => {
      const e = 6 + 16 * i;
      const dim = sizes[i] >= 256 ? 0 : sizes[i];
      dv.setUint8(e, dim);               // width
      dv.setUint8(e + 1, dim);           // height
      dv.setUint8(e + 2, 0);             // palette colors
      dv.setUint8(e + 3, 0);             // reserved
      dv.setUint16(e + 4, 1, true);      // color planes
      dv.setUint16(e + 6, 32, true);     // bits per pixel
      dv.setUint32(e + 8, png.length, true);
      dv.setUint32(e + 12, offset, true);
      bytes.set(png, offset);
      offset += png.length;
    });
    return new Blob([buf], { type: 'image/x-icon' });
  }

  // One list drives the file rows, individual downloads, ZIPs and the manifest.
  const FILES = [
    { name: 'favicon.ico', type: 'ico', note: '16, 32 and 48 px, keeps transparency' },
    { name: 'favicon-16x16.png', type: 'png', size: 16, variant: 'icon', note: 'Keeps your shape and transparency' },
    { name: 'favicon-32x32.png', type: 'png', size: 32, variant: 'icon', note: 'Keeps your shape and transparency' },
    { name: 'apple-touch-icon.png', type: 'png', size: 180, variant: 'full', note: 'Opaque, full-bleed square' },
    { name: 'android-chrome-192x192.png', type: 'png', size: 192, variant: 'icon', manifest: {}, note: 'Keeps your design' },
    { name: 'android-chrome-512x512.png', type: 'png', size: 512, variant: 'icon', manifest: {}, note: 'Keeps your design' },
    { name: 'maskable-512x512.png', type: 'png', size: 512, variant: 'maskable', manifest: { purpose: 'maskable' }, note: 'Opaque, glyph inside the safe zone' },
    { name: 'site.webmanifest', type: 'text', mime: 'application/manifest+json', build: buildManifest, note: 'Icons, colors and names' },
    { name: 'snippet.html', type: 'text', mime: 'text/html', build: buildSnippet, note: 'Link tags to paste into your site' },
  ];

  function buildManifest() {
    const m = state.manifest;
    const icons = FILES.filter((f) => f.manifest).map((f) => ({
      src: f.name, // relative to the manifest, so it works wherever the files are hosted together
      sizes: `${f.size}x${f.size}`,
      type: 'image/png',
      ...f.manifest,
    }));
    return JSON.stringify({
      name: m.name.trim() || 'My Website',
      short_name: m.shortName.trim() || m.name.trim() || 'My Site',
      icons,
      theme_color: themeColor(),
      background_color: m.backgroundColor,
      display: 'standalone',
    }, null, 2) + '\n';
  }

  function buildSnippet() {
    return [
      '<link rel="icon" href="/favicon.ico" sizes="48x48">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/site.webmanifest">',
      `<meta name="theme-color" content="${themeColor()}">`,
      '',
    ].join('\n');
  }

  async function fileBlob(def) {
    if (def.type === 'ico') return buildIco();
    if (def.type === 'png') return canvasToBlob(render(def.size, { variant: def.variant }));
    return new Blob([def.build()], { type: `${def.mime};charset=utf-8` });
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadZip(kind) {
    if (typeof JSZip === 'undefined') throw new Error('The ZIP library did not load. Check your connection and reload the page.');
    const zip = new JSZip();
    const defs = FILES.filter((f) => kind === 'package' || f.type === 'ico' || f.type === 'png');
    for (const def of defs) zip.file(def.name, await fileBlob(def));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveBlob(blob, kind === 'package' ? 'favicon-package.zip' : 'favicon-set.zip');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  // ---------------------------------------------------------------------------
  // UI: color fields (picker + hex input, validated)
  // ---------------------------------------------------------------------------
  const colorFields = {};

  // Each field maps to a place in `state`. `auto` fields follow the background color until edited.
  const COLOR_BINDINGS = {
    iconColor:   { get: () => state.iconColor,               set: (v) => { state.iconColor = v; } },
    bgColor:     { get: () => state.bgColor,                 set: (v) => { state.bgColor = v; } },
    borderColor: { get: () => state.borderColor,             set: (v) => { state.borderColor = v; } },
    fillColor:   { get: fillColor,                           set: (v) => { state.fillColor = v; } },
    themeColor:  { get: themeColor,                          set: (v) => { state.manifest.themeColor = v; } },
    manifestBg:  { get: () => state.manifest.backgroundColor, set: (v) => { state.manifest.backgroundColor = v; } },
  };

  function createColorField(host) {
    const key = host.dataset.colorField;
    const label = host.dataset.label;
    const { get, set } = COLOR_BINDINGS[key];
    const id = `field-${key}`;
    host.innerHTML = `
      <label class="field-label" for="${id}">${label}</label>
      <div class="mt-1 flex items-center gap-2">
        <input type="color" id="${id}">
        <label class="sr-only" for="${id}-hex">${label}, hex value</label>
        <input type="text" id="${id}-hex" class="input font-mono" maxlength="7" autocomplete="off" spellcheck="false" placeholder="#6366f1">
      </div>
      <p id="${id}-err" class="mt-1 hidden text-xs text-red-400">Use 3 or 6 hex digits, like #6366f1.</p>`;
    const picker = $(`#${id}`, host);
    const hexInput = $(`#${id}-hex`, host);
    const err = $(`#${id}-err`, host);
    hexInput.setAttribute('aria-describedby', `${id}-err`);

    const setInvalid = (bad) => {
      hexInput.setAttribute('aria-invalid', bad ? 'true' : 'false');
      err.classList.toggle('hidden', !bad);
    };

    picker.addEventListener('input', () => {
      set(picker.value);
      hexInput.value = picker.value;
      setInvalid(false);
      onChange();
    });
    hexInput.addEventListener('input', () => {
      const v = normalizeHex(hexInput.value);
      setInvalid(!v);
      if (v) { set(v); picker.value = v; onChange(); }
    });
    hexInput.addEventListener('blur', () => { // tidy up: normalize valid input, revert invalid input
      hexInput.value = get();
      setInvalid(false);
    });

    colorFields[key] = {
      picker, hexInput,
      sync() {
        const v = get();
        picker.value = v;
        if (document.activeElement !== hexInput) hexInput.value = v;
      },
      setDisabled(disabled) { picker.disabled = disabled; hexInput.disabled = disabled; },
    };
  }

  // ---------------------------------------------------------------------------
  // UI: sync, events
  // ---------------------------------------------------------------------------
  let rafId = 0;
  function onChange() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; update(); });
  }

  function paintPreviews() {
    const dpr = window.devicePixelRatio || 1;
    $$('canvas[data-size]').forEach((c) => render(Number(c.dataset.size), { variant: c.dataset.variant || 'icon' }, c));
    // A real browser picks the ICO frame nearest the screen density; mimic that in the tab mockups.
    const tabPx = dpr >= 2.5 ? 48 : dpr >= 1.5 ? 32 : 16;
    $$('canvas[data-tab-icon]').forEach((c) => render(tabPx, {}, c));
    render(32 * Math.min(2, Math.ceil(dpr)), {}, $('#miniPreview'));
  }

  function update() {
    Object.values(colorFields).forEach((f) => f.sync());
    $('#fillRow').classList.toggle('hidden', !state.bgTransparent);
    $('#radiusRow').classList.toggle('hidden', state.shape !== 'rounded');
    $('#iconName').textContent = state.icon;
    $$('[data-tab-title]').forEach((el) => { el.textContent = state.manifest.shortName.trim() || state.manifest.name.trim() || 'My Website'; });
    $('#snippetCode').textContent = buildSnippet();
    paintPreviews();
    saveSoon();
  }

  function setRangeUI(id, value, format) {
    $(`#${id}`).value = value;
    $(`#${id}Out`).textContent = format(value);
  }

  function syncControls() {
    setRangeUI('scale', state.scale, (v) => `${v}%`);
    setRangeUI('rotation', state.rotation, (v) => `${v}°`);
    setRangeUI('radius', state.radius, (v) => `${v}%`);
    setRangeUI('borderWidth', state.borderWidth, (v) => `${v}%`);
    $('#flipH').setAttribute('aria-pressed', String(state.flipH));
    $('#flipV').setAttribute('aria-pressed', String(state.flipV));
    $('#rotationReset').disabled = state.rotation === 0;
    const radio = $(`input[name="shape"][value="${state.shape}"]`);
    if (radio) radio.checked = true;
    $('#bgTransparent').checked = state.bgTransparent;
    colorFields.bgColor.setDisabled(state.bgTransparent);
    $('#manifestName').value = state.manifest.name;
    $('#manifestShort').value = state.manifest.shortName;
    Object.values(colorFields).forEach((f) => f.sync());
  }

  function bindRange(id, key, format) {
    $(`#${id}`).addEventListener('input', (e) => {
      state[key] = Number(e.target.value);
      $(`#${id}Out`).textContent = format(state[key]);
      if (key === 'rotation') $('#rotationReset').disabled = state.rotation === 0;
      onChange();
    });
  }

  function bindControls() {
    $$('[data-color-field]').forEach(createColorField);

    bindRange('scale', 'scale', (v) => `${v}%`);
    bindRange('rotation', 'rotation', (v) => `${v}°`);
    bindRange('radius', 'radius', (v) => `${v}%`);
    bindRange('borderWidth', 'borderWidth', (v) => `${v}%`);

    $('#rotationReset').addEventListener('click', () => { state.rotation = 0; syncControls(); onChange(); });

    for (const [id, key] of [['flipH', 'flipH'], ['flipV', 'flipV']]) {
      $(`#${id}`).addEventListener('click', (e) => {
        state[key] = !state[key];
        e.currentTarget.setAttribute('aria-pressed', String(state[key]));
        onChange();
      });
    }

    $$('input[name="shape"]').forEach((r) => r.addEventListener('change', () => { state.shape = r.value; onChange(); }));

    $('#bgTransparent').addEventListener('change', (e) => {
      state.bgTransparent = e.target.checked;
      colorFields.bgColor.setDisabled(state.bgTransparent);
      onChange();
    });

    $('#manifestName').addEventListener('input', (e) => { state.manifest.name = e.target.value; onChange(); });
    $('#manifestShort').addEventListener('input', (e) => { state.manifest.shortName = e.target.value; onChange(); });

    $('#resetAll').addEventListener('click', () => {
      Object.assign(state, DEFAULTS, { manifest: { ...DEFAULTS.manifest } });
      syncControls();
      markSelectedIcon();
      onChange();
    });
  }

  // ---------------------------------------------------------------------------
  // Icon picker
  // ---------------------------------------------------------------------------
  const grid = () => $('#iconGrid');
  let filterTimer = 0;

  function renderGrid() {
    const q = $('#filter').value.trim().toLowerCase();
    const list = q ? NAMES.filter((n) => n.includes(q)) : NAMES;
    const total = NAMES.length.toLocaleString();
    $('#iconCount').textContent = q ? `${list.length.toLocaleString()} of ${total} icons` : `${total} icons`;

    if (!list.length) {
      grid().innerHTML = `<p class="col-span-full px-2 py-6 text-center text-sm text-mute">No icons match that search. Try a shorter word.</p>`;
      return;
    }
    // Names are [a-z0-9-] only, so they are safe to put in markup.
    grid().innerHTML = list.map((n) =>
      `<button type="button" class="icon-btn" data-icon="${n}" title="${n}" aria-label="${n}" aria-pressed="${n === state.icon}" tabindex="-1"><i class="bi bi-${n}" aria-hidden="true"></i></button>`
    ).join('');
    setRoving($('.icon-btn[aria-pressed="true"]', grid()) || grid().firstElementChild);
  }

  function setRoving(btn) {
    $$('.icon-btn[tabindex="0"]', grid()).forEach((b) => { b.tabIndex = -1; });
    if (btn && btn.classList.contains('icon-btn')) btn.tabIndex = 0;
  }

  function markSelectedIcon() {
    $$('.icon-btn[aria-pressed="true"]', grid()).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const sel = $(`.icon-btn[data-icon="${state.icon}"]`, grid());
    if (sel) sel.setAttribute('aria-pressed', 'true');
  }

  function bindPicker() {
    $('#filter').addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => { renderGrid(); grid().scrollTop = 0; }, 150);
    });

    grid().addEventListener('click', (e) => {
      const btn = e.target.closest('.icon-btn');
      if (!btn) return;
      state.icon = btn.dataset.icon;
      markSelectedIcon();
      setRoving(btn);
      onChange();
    });

    grid().addEventListener('focusin', (e) => {
      const btn = e.target.closest('.icon-btn');
      if (btn) setRoving(btn);
    });

    // Arrow-key navigation: the grid is one tab stop instead of 2,000.
    grid().addEventListener('keydown', (e) => {
      const btn = e.target.closest('.icon-btn');
      if (!btn) return;
      const items = grid().children;
      const i = Array.prototype.indexOf.call(items, btn);
      let cols = 1;
      while (cols < items.length && items[cols].offsetTop === items[0].offsetTop) cols++;
      const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      let next = null;
      if (e.key in moves) next = i + moves[e.key];
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      if (next === null) return;
      e.preventDefault();
      if (items[next]) items[next].focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Downloads UI
  // ---------------------------------------------------------------------------
  function setStatus(message, isError = false) {
    const el = $('#exportStatus');
    el.textContent = message;
    el.classList.toggle('text-red-400', isError);
    el.classList.toggle('text-mute', !isError);
  }

  async function runExport(button, task, doneMessage) {
    button.disabled = true;
    setStatus('Preparing…');
    try {
      await task();
      setStatus(doneMessage);
    } catch (e) {
      setStatus(`Download failed. ${e.message || e}`, true);
    } finally {
      button.disabled = false;
    }
  }

  function buildFileList() {
    $('#fileList').innerHTML = FILES.map((f) => {
      const thumb = f.type === 'text'
        ? `<div class="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-line bg-inset text-lg text-mute"><i class="bi ${f.name.endsWith('.html') ? 'bi-filetype-html' : 'bi-filetype-json'}" aria-hidden="true"></i></div>`
        : `<div class="checker checker-sm h-10 w-10 flex-none overflow-hidden rounded-md"><canvas data-size="${Math.min(f.size || 48, 64)}" data-variant="${f.variant || 'icon'}" class="pixelated block h-10 w-10" aria-hidden="true"></canvas></div>`;
      return `<li class="flex items-center gap-3 py-3">
        ${thumb}
        <div class="min-w-0 flex-1">
          <p class="break-words text-sm font-medium">${f.name}</p>
          <p class="hint">${f.note}</p>
        </div>
        <button type="button" class="btn flex-none" data-file="${f.name}" aria-label="Download ${f.name}">
          <i class="bi bi-download" aria-hidden="true"></i><span class="sr-only sm:not-sr-only">Download</span>
        </button>
      </li>`;
    }).join('');
  }

  function bindDownloads() {
    buildFileList();

    $('#fileList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-file]');
      if (!btn) return;
      const def = FILES.find((f) => f.name === btn.dataset.file);
      runExport(btn, async () => saveBlob(await fileBlob(def), def.name), `Downloaded ${def.name}.`);
    });

    $('#zipSet').addEventListener('click', (e) =>
      runExport(e.currentTarget, () => downloadZip('set'), 'Downloaded favicon-set.zip.'));
    $('#zipPackage').addEventListener('click', (e) =>
      runExport(e.currentTarget, () => downloadZip('package'), 'Downloaded favicon-package.zip.'));

    const copyBtn = $('#copySnippet');
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(buildSnippet());
      const label = $('span', copyBtn);
      const icon = $('i', copyBtn);
      label.textContent = ok ? 'Copied' : 'Copy failed';
      icon.className = ok ? 'bi bi-clipboard-check' : 'bi bi-clipboard-x';
      setTimeout(() => { label.textContent = 'Copy snippet'; icon.className = 'bi bi-clipboard'; }, 1600);
    });
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  function applyThemeUI() {
    const dark = document.documentElement.classList.contains('dark');
    const btn = $('#themeToggle');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    $('i', btn).className = dark ? 'bi bi-sun' : 'bi bi-moon-stars';
  }

  function bindTheme() {
    applyThemeUI();
    $('#themeToggle').addEventListener('click', () => {
      const dark = !document.documentElement.classList.contains('dark');
      document.documentElement.classList.toggle('dark', dark);
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
      applyThemeUI();
    });
  }

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------
  function showLoadError(messages) {
    const el = $('#loadError');
    el.innerHTML = `<strong class="font-semibold">Some resources did not load.</strong> ${messages.join(' ')} Check your connection and reload the page.`;
    el.classList.remove('hidden');
  }

  async function loadIconList() {
    const res = await fetch(ICON_JSON_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ICONS = new Map(Object.entries(data));
    NAMES = [...ICONS.keys()].sort();
    if (!NAMES.length) throw new Error('the list was empty');
  }

  async function loadIconFont() {
    // Rejects if the font file fails; resolves with no faces if the stylesheet itself never loaded.
    const faces = await document.fonts.load(`32px ${FONT_FAMILY}`);
    if (!faces.length) throw new Error('the font face was not found');
  }

  async function init() {
    loadSettings();
    bindTheme();
    bindControls();
    bindDownloads();
    bindPicker();
    syncControls();
    update();

    const problems = [];
    const [list, font] = await Promise.allSettled([loadIconList(), loadIconFont()]);
    if (list.status === 'rejected') problems.push(`The icon list could not be loaded (${list.reason.message}).`);
    if (font.status === 'rejected') problems.push(`The icon font could not be loaded (${font.reason.message}).`);
    if (problems.length) showLoadError(problems);

    fontReady = font.status === 'fulfilled';
    if (list.status === 'fulfilled') {
      if (!ICONS.has(state.icon)) state.icon = DEFAULTS.icon;
      renderGrid();
    } else {
      $('#iconCount').textContent = 'Icons unavailable';
    }
    update();
  }

  init();
})();
