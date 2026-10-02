// Theme picker: custom dropdown using the ARIA listbox pattern.
// Hover or arrow onto an option to preview it; closing without choosing
// restores the saved theme. Opens as a bottom sheet on phones.

const T = () => window.BleeprThemes;
const SEARCH_THRESHOLD = 12;

function icon(name) {
  return `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
}

function swatchStrip(vars) {
  return ['--bg', '--surface', '--accent', '--note']
    .map((k) => `<span class="tp-sw" style="background:${vars[k]}"></span>`)
    .join('');
}

export function mountThemePicker(container) {
  const themes = T().list;
  const showSearch = themes.length > SEARCH_THRESHOLD;
  const groups = [];
  for (const t of themes) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) groups.push((g = { name: t.group, items: [] }));
    g.items.push(t);
  }

  const optHtml = (id, name, vars) => `
    <div class="tp-opt" role="option" id="tp-opt-${id}" data-id="${id}" data-name="${name.toLowerCase()}" aria-selected="false">
      <span class="tp-strip" aria-hidden="true">${swatchStrip(vars)}</span>
      <span class="tp-opt-name">${name}</span>
      <span class="tp-check">${icon('check')}</span>
    </div>`;

  container.innerHTML = `
    <button type="button" id="tp-btn" class="btn tp-button" aria-haspopup="listbox" aria-expanded="false" aria-controls="tp-panel" title="Theme">
      <span class="tp-strip tp-strip-current" aria-hidden="true">
        <span class="tp-sw bg-bg"></span><span class="tp-sw bg-surface"></span><span class="tp-sw bg-accent"></span><span class="tp-sw bg-note"></span>
      </span>
      <span class="tp-btn-icon">${icon('palette')}</span>
      <span class="tp-current-name" id="tp-current-name"></span>
      ${icon('keyboard_arrow_down')}
    </button>
    <div class="tp-backdrop" id="tp-backdrop" hidden></div>
    <div class="tp-panel" id="tp-panel" hidden>
      <div class="tp-head">
        <span class="tp-title" id="tp-title">Theme</span>
        <button type="button" class="btn icon-btn tp-close" id="tp-close" aria-label="Close theme picker" title="Close">${icon('close')}</button>
      </div>
      ${showSearch ? `<label class="tp-search">${icon('search')}<input id="tp-search" type="search" placeholder="Search themes" aria-label="Search themes" aria-controls="tp-list" autocomplete="off"></label>` : ''}
      <div class="tp-list" id="tp-list" role="listbox" tabindex="-1" aria-labelledby="tp-title">
        ${optHtml(T().SYSTEM, 'System (auto)', T().vars(T().SYSTEM))}
        ${groups.map((g, gi) => `
          <div role="group" aria-labelledby="tp-g-${gi}">
            <div class="tp-group" id="tp-g-${gi}" role="presentation">${g.name}</div>
            ${g.items.map((t) => optHtml(t.id, t.name, T().vars(t.id))).join('')}
          </div>`).join('')}
      </div>
    </div>`;

  const btn = container.querySelector('#tp-btn');
  const panel = container.querySelector('#tp-panel');
  const backdrop = container.querySelector('#tp-backdrop');
  const list = container.querySelector('#tp-list');
  const search = container.querySelector('#tp-search');
  const nameEl = container.querySelector('#tp-current-name');
  const opts = [...list.querySelectorAll('[role="option"]')];
  let active = null;
  let typeBuf = '';
  let typeTimer = 0;
  // On touch screens, don't focus the search box on open (it would raise the keyboard).
  const coarse = matchMedia('(pointer: coarse)');
  const focusTarget = () => (search && !coarse.matches ? search : list);
  const setDescendant = (id) => {
    for (const el of [list, search]) {
      if (!el) continue;
      if (id) el.setAttribute('aria-activedescendant', id); else el.removeAttribute('aria-activedescendant');
    }
  };

  function labelFor(id) {
    if (id === T().SYSTEM) return 'System';
    return T().get(id)?.name || 'Theme';
  }

  function syncButton() {
    const choice = T().choice();
    nameEl.textContent = labelFor(choice);
    btn.setAttribute('aria-label', `Theme: ${labelFor(choice)}`);
    for (const o of opts) o.setAttribute('aria-selected', String(o.dataset.id === choice));
    // System option swatches follow the OS
    const sys = opts[0].querySelector('.tp-strip');
    sys.innerHTML = swatchStrip(T().vars(T().SYSTEM));
  }

  const visible = () => opts.filter((o) => !o.hidden);

  function setActive(o, { preview = true, scroll = true } = {}) {
    if (active) active.classList.remove('is-active');
    active = o;
    if (!o) { setDescendant(null); return; }
    o.classList.add('is-active');
    setDescendant(o.id);
    if (scroll) o.scrollIntoView({ block: 'nearest' });
    if (preview) T().preview(o.dataset.id);
  }

  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    backdrop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (search) { search.value = ''; filter(''); }
    const cur = opts.find((o) => o.dataset.id === T().choice()) || opts[0];
    setActive(cur, { preview: false });
    focusTarget().focus();
    document.addEventListener('pointerdown', onOutside, true);
  }

  function close(commit = false) {
    if (panel.hidden) return;
    if (!commit) T().restore();
    panel.hidden = true;
    backdrop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    syncButton();
    btn.focus();
  }

  function choose(o) {
    if (!o) return;
    T().set(o.dataset.id);
    close(true);
  }

  function onOutside(e) {
    if (!container.contains(e.target) || e.target === backdrop) close(false);
  }

  function filter(q) {
    q = q.trim().toLowerCase();
    for (const o of opts) {
      const t = T().get(o.dataset.id);
      o.hidden = !!q && !(o.dataset.name.includes(q) || (t && t.group.toLowerCase().includes(q)));
    }
    for (const g of list.querySelectorAll('[role="group"]')) g.hidden = ![...g.querySelectorAll('[role="option"]')].some((o) => !o.hidden);
    const v = visible();
    if (!v.includes(active)) setActive(v[0] || null);
  }

  function move(delta) {
    const v = visible();
    if (!v.length) return;
    const i = v.indexOf(active);
    setActive(v[Math.max(0, Math.min(v.length - 1, (i < 0 ? 0 : i + delta)))]);
  }

  function typeAhead(ch) {
    clearTimeout(typeTimer);
    typeBuf += ch.toLowerCase();
    typeTimer = setTimeout(() => (typeBuf = ''), 600);
    const v = visible();
    const start = Math.max(0, v.indexOf(active) + (typeBuf.length === 1 ? 1 : 0));
    const ordered = v.slice(start).concat(v.slice(0, start));
    const hit = ordered.find((o) => o.dataset.name.startsWith(typeBuf));
    if (hit) setActive(hit);
  }

  function onKey(e) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': if (e.target === search) return; e.preventDefault(); setActive(visible()[0]); break;
      case 'End': if (e.target === search) return; e.preventDefault(); setActive(visible().at(-1)); break;
      case 'PageDown': e.preventDefault(); move(5); break;
      case 'PageUp': e.preventDefault(); move(-5); break;
      case 'Enter': e.preventDefault(); choose(active); break;
      case ' ':
        if (e.target === search) return;
        e.preventDefault(); choose(active); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(false); break;
      case 'Tab': close(false); break;
      default:
        if (e.target !== search && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  }

  btn.addEventListener('click', () => (panel.hidden ? open() : close(false)));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  });
  container.querySelector('#tp-close').addEventListener('click', () => close(false));
  list.addEventListener('keydown', onKey);
  if (search) {
    search.addEventListener('keydown', onKey);
    search.addEventListener('input', () => filter(search.value));
  }
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const o = e.target.closest('[role="option"]');
    if (o && o !== active) setActive(o, { scroll: false });
  });
  list.addEventListener('click', (e) => {
    const o = e.target.closest('[role="option"]');
    if (o) choose(o);
  });
  document.addEventListener('themechange', () => { if (panel.hidden) syncButton(); });

  syncButton();
  return { open, close };
}

// Inline theme list (used on the first welcome card). Choosing an option
// applies and saves it straight away; arrow keys move and choose.
export function mountThemeList(container, { label = 'Theme', prefix = 'tl' } = {}) {
  const themes = T().list;
  const groups = [];
  for (const t of themes) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) groups.push((g = { name: t.group, items: [] }));
    g.items.push(t);
  }
  const opt = (id, name) => `
    <div class="tp-opt" role="option" id="${prefix}-opt-${id}" data-id="${id}" aria-selected="false">
      <span class="tp-strip" aria-hidden="true">${swatchStrip(T().vars(id))}</span>
      <span class="tp-opt-name">${name}</span>
      <span class="tp-check">${icon('check')}</span>
    </div>`;
  container.innerHTML = `
    <div class="tp-list theme-inline" role="listbox" tabindex="0" aria-label="${label}">
      ${opt(T().SYSTEM, 'System (auto)')}
      ${groups.map((g, gi) => `
        <div role="group" aria-labelledby="${prefix}-g-${gi}">
          <div class="tp-group" id="${prefix}-g-${gi}" role="presentation">${g.name}</div>
          ${g.items.map((t) => opt(t.id, t.name)).join('')}
        </div>`).join('')}
    </div>`;
  const list = container.querySelector('[role="listbox"]');
  const opts = [...list.querySelectorAll('[role="option"]')];

  // Scroll inside the list only (scrollIntoView could also move the carousel).
  function reveal(o, center = false) {
    const top = o.offsetTop, bottom = top + o.offsetHeight, head = 30;
    if (center) list.scrollTop = top - list.clientHeight / 2 + o.offsetHeight / 2;
    else if (top - head < list.scrollTop) list.scrollTop = top - head;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  function sync(center = false) {
    const choice = T().choice();
    let cur = null;
    for (const o of opts) {
      const on = o.dataset.id === choice;
      o.setAttribute('aria-selected', String(on));
      o.classList.toggle('is-active', on);
      if (on) cur = o;
    }
    // System swatches follow the OS
    opts[0].querySelector('.tp-strip').innerHTML = swatchStrip(T().vars(T().SYSTEM));
    if (cur) { list.setAttribute('aria-activedescendant', cur.id); if (center) reveal(cur, true); }
  }

  function choose(o) {
    if (!o) return;
    T().set(o.dataset.id);
    sync();
    reveal(o);
  }

  list.addEventListener('click', (e) => choose(e.target.closest('[role="option"]')));
  list.addEventListener('keydown', (e) => {
    const i = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    let next = null;
    if (e.key === 'ArrowDown') next = opts[Math.min(opts.length - 1, i + 1)];
    else if (e.key === 'ArrowUp') next = opts[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = opts[0];
    else if (e.key === 'End') next = opts.at(-1);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    choose(next);
  });
  document.addEventListener('themechange', () => sync());
  sync();
  return { refresh: () => sync(true) };
}
