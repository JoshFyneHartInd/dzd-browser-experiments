// Builds the theme picker and applies/saves themes. THEMES comes from js/themes.js (classic script).

const GROUP_ORDER = ['Standard', 'Dark', 'Light'];
const DEFAULT_ID = 'midnight';

function themes() {
  return globalThis.THEMES || [];
}

function find(id) {
  const all = themes();
  return all.find((t) => t.id === id) || all.find((t) => t.id === DEFAULT_ID);
}

/** Apply a theme to <html>, clearing the previous theme's properties first. */
export function applyTheme(id) {
  const next = find(id);
  if (!next) return null;
  const root = document.documentElement;
  const prev = themes().find((t) => t.id === root.dataset.theme);
  if (prev) Object.keys(prev.vars).forEach((k) => root.style.removeProperty(k));
  Object.keys(next.vars).forEach((k) => root.style.setProperty(k, next.vars[k]));
  root.style.colorScheme = next.scheme;
  root.dataset.theme = next.id;
  return next;
}

export function initThemePicker(select) {
  const all = themes();
  if (!select || all.length === 0) return;

  for (const group of GROUP_ORDER) {
    const inGroup = all.filter((t) => t.group === group);
    if (inGroup.length === 0) continue;
    const og = document.createElement('optgroup');
    og.label = group;
    for (const t of inGroup) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      og.append(opt);
    }
    select.append(og);
  }

  select.value = document.documentElement.dataset.theme || DEFAULT_ID;
  select.addEventListener('change', () => {
    const t = applyTheme(select.value);
    if (!t) return;
    try {
      localStorage.setItem('theme', t.id);
    } catch {
      /* storage unavailable: the theme still applies for this visit */
    }
  });
}
