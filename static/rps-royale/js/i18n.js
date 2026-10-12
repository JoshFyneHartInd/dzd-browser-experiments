'use strict';
/* Tiny translation layer.
   - Language files (public/i18n/xx.js) register themselves on window.RPS_LANGS.
   - t(key, params)  -> plain text   (use esc() before putting it in HTML)
   - h(key, params, raw) -> HTML-safe text: params are escaped, `raw` values are inserted as-is
   - Plurals: pass { count } and define key.one / key.other (any CLDR category works, e.g. .few)
   - Missing keys fall back to English, then to the key itself. */

const LANGS = window.RPS_LANGS || {};
const DEFAULT_LANG = 'en';
const LANG_KEY = 'rps-lang';

const I18n = (() => {
  let lang = DEFAULT_LANG;
  let rules = new Intl.PluralRules(DEFAULT_LANG);

  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Best match from the browser's language list, e.g. "es-MX" -> "es".
  function detect() {
    const wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || DEFAULT_LANG]);
    for (const w of wanted) {
      const base = String(w).toLowerCase().split('-')[0];
      if (LANGS[base]) return base;
    }
    return DEFAULT_LANG;
  }

  function set(code, remember) {
    lang = LANGS[code] ? code : DEFAULT_LANG;
    rules = new Intl.PluralRules(lang);
    if (remember) write(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }

  function init() {
    const saved = read(LANG_KEY);
    set(saved && LANGS[saved] ? saved : detect(), false);
  }

  function lookup(key, params) {
    let table = (LANGS[lang] || {}).strings || {};
    const fall = (LANGS[DEFAULT_LANG] || {}).strings || {};
    let k = key;
    if (params && typeof params.count === 'number') {
      const form = `${key}.${rules.select(params.count)}`;
      if (form in table) k = form;
      else if (form in fall) { k = form; table = fall; }
      else if (`${key}.other` in table) k = `${key}.other`;
      else if (`${key}.other` in fall) { k = `${key}.other`; table = fall; }
    }
    if (k in table) return table[k];
    if (k in fall) return fall[k];
    return key;
  }

  const fill = (str, params, raw, safe) =>
    str.replace(/\{(\w+)\}/g, (m, name) => {
      if (raw && name in raw) return raw[name];
      if (params && name in params) return safe ? escHtml(params[name]) : String(params[name]);
      return m;
    });

  return {
    init,
    set,
    get lang() { return lang; },
    has: (key) => key in ((LANGS[lang] || {}).strings || {}) || key in ((LANGS[DEFAULT_LANG] || {}).strings || {}),
    list: () => Object.keys(LANGS).map((code) => ({ code, name: LANGS[code].name })),
    t: (key, params) => fill(lookup(key, params), params, null, false),
    h: (key, params, raw) => fill(lookup(key, params), params, raw, true),
  };
})();

const t = I18n.t;
const h = I18n.h;
