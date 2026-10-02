/* Theme registry. Classic script, loaded in <head> before first paint.
 * Single source of truth for theme colors. Exposes window.BleeprThemes.
 * Each theme: { id, name, group, scheme: 'light'|'dark', vars: { '--bg': ... } }
 * Missing variables fall back to Paper (light) or Midnight (dark).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'bleepr.theme';
  var SYSTEM = 'system';

  var THEMES = [
    {
      id: 'paper', name: 'Paper', group: 'Standard', scheme: 'light',
      vars: {
        '--bg': '#f6f5f1', '--surface': '#ffffff', '--surface-2': '#ebeae4', '--border': '#d4d2c8',
        '--fg': '#1b1c1f', '--fg-muted': '#62646b', '--accent': '#2f6fed', '--accent-fg': '#ffffff',
        '--note': '#e0702a', '--note-selected': '#b3470a', '--key-white': '#ffffff', '--key-black': '#2a2b2f',
        '--danger': '#c62f3a',
        '--layer-1': '#d4621c', '--layer-2': '#2f6fed', '--layer-3': '#2b8a3e',
        '--layer-4': '#9c36b5', '--layer-5': '#c2255c', '--layer-6': '#0c8599'
      }
    },
    {
      id: 'midnight', name: 'Midnight', group: 'Standard', scheme: 'dark',
      vars: {
        '--bg': '#14161a', '--surface': '#1d2026', '--surface-2': '#272b33', '--border': '#363b45',
        '--fg': '#e8e9ec', '--fg-muted': '#9aa0ab', '--accent': '#6c9bff', '--accent-fg': '#0b1020',
        '--note': '#ffa05c', '--note-selected': '#ffc89a', '--key-white': '#d9dbe0', '--key-black': '#0f1013',
        '--danger': '#ff7a85',
        '--layer-1': '#ffa05c', '--layer-2': '#6c9bff', '--layer-3': '#6fd08a',
        '--layer-4': '#d29bff', '--layer-5': '#ff7aa8', '--layer-6': '#4fd1e0'
      }
    },
    {
      id: 'phosphor', name: 'Phosphor', group: 'Retro', scheme: 'dark',
      vars: {
        '--bg': '#050a05', '--surface': '#0b140b', '--surface-2': '#122012', '--border': '#21402a',
        '--fg': '#8dff8d', '--fg-muted': '#55b862', '--accent': '#39ff6a', '--accent-fg': '#021a06',
        '--note': '#b8ff4d', '--note-selected': '#ecffc4', '--key-white': '#9fd39f', '--key-black': '#061006',
        '--danger': '#ff6b5b',
        '--layer-1': '#b8ff4d', '--layer-2': '#39ffc8', '--layer-3': '#ffe14d',
        '--layer-4': '#8fb4ff', '--layer-5': '#ff8ad8', '--layer-6': '#ffffff'
      }
    },
    {
      id: 'amber', name: 'Amber Glow', group: 'Retro', scheme: 'dark',
      vars: {
        '--bg': '#0b0700', '--surface': '#160e02', '--surface-2': '#231705', '--border': '#43300c',
        '--fg': '#ffb547', '--fg-muted': '#c98a30', '--accent': '#ffb000', '--accent-fg': '#1a0f00',
        '--note': '#ff8a1a', '--note-selected': '#ffdca3', '--key-white': '#e8c48a', '--key-black': '#0f0900',
        '--danger': '#ff5c4d',
        '--layer-1': '#ff8a1a', '--layer-2': '#ffd54d', '--layer-3': '#ff6a4d',
        '--layer-4': '#fff1c9', '--layer-5': '#e0a060', '--layer-6': '#ffb0a0'
      }
    },
    {
      id: 'grape', name: 'Grape Soda', group: 'Retro', scheme: 'dark',
      vars: {
        '--bg': '#1a0f2e', '--surface': '#24163d', '--surface-2': '#301f50', '--border': '#4a3374',
        '--fg': '#f3eaff', '--fg-muted': '#bba8de', '--accent': '#c98bff', '--accent-fg': '#1a0f2e',
        '--note': '#ff9de2', '--note-selected': '#ffe0f6', '--key-white': '#e6dcf5', '--key-black': '#120a20',
        '--danger': '#ff7a8a',
        '--layer-1': '#ff9de2', '--layer-2': '#8fd3ff', '--layer-3': '#b6f28c',
        '--layer-4': '#ffd36b', '--layer-5': '#c98bff', '--layer-6': '#7ef0d2'
      }
    },
    {
      id: 'lobby', name: 'Lobby Beige', group: 'Retro', scheme: 'light',
      vars: {
        '--bg': '#e9e0cc', '--surface': '#f6f0e2', '--surface-2': '#e0d5bc', '--border': '#c4b593',
        '--fg': '#2b2418', '--fg-muted': '#65573f', '--accent': '#2c6a5c', '--accent-fg': '#ffffff',
        '--note': '#b4521a', '--note-selected': '#6e2f08', '--key-white': '#fbf7ee', '--key-black': '#3a3226',
        '--danger': '#b3261e',
        '--layer-1': '#b4521a', '--layer-2': '#2c6a5c', '--layer-3': '#5c4bb0',
        '--layer-4': '#9a6a00', '--layer-5': '#a8325a', '--layer-6': '#2f6aa3'
      }
    }
  ];

  var byId = {};
  for (var i = 0; i < THEMES.length; i++) byId[THEMES[i].id] = THEMES[i];
  var VAR_NAMES = Object.keys(byId.paper.vars);

  function fullVars(theme) {
    var base = theme.scheme === 'dark' ? byId.midnight.vars : byId.paper.vars;
    var out = {};
    for (var j = 0; j < VAR_NAMES.length; j++) {
      var k = VAR_NAMES[j];
      out[k] = theme.vars[k] || base[k];
    }
    return out;
  }

  function block(selector, theme) {
    var v = fullVars(theme), s = selector + '{';
    for (var k in v) s += k + ':' + v[k] + ';';
    return s + 'color-scheme:' + theme.scheme + ';}';
  }

  // One <style> with a block per theme. Bare :root and the host's
  // light/dark attribute values fall back to Paper / Midnight.
  var css = block(':root', byId.paper);
  css += block('[data-theme="light"]', byId.paper);
  css += block('[data-theme="dark"]', byId.midnight);
  for (var t = 0; t < THEMES.length; t++) css += block('[data-theme="' + THEMES[t].id + '"]', THEMES[t]);
  var style = document.createElement('style');
  style.id = 'bleepr-themes';
  style.textContent = css;
  document.head.appendChild(style);

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY) || SYSTEM; } catch (e) { return SYSTEM; }
  }
  function writeChoice(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* storage blocked */ }
  }

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolve(id) {
    if (id === SYSTEM || !byId[id]) return mq && mq.matches ? 'midnight' : 'paper';
    return id;
  }

  var root = document.documentElement;
  var applied = null;
  var choice = readChoice();

  function apply(id) {
    var real = resolve(id);
    applied = real;
    root.setAttribute('data-theme', real);
    root.classList.toggle('dark', byId[real].scheme === 'dark');
    try { document.dispatchEvent(new CustomEvent('themechange', { detail: { id: id, resolved: real } })); } catch (e) { /* old browser */ }
    return real;
  }

  apply(choice);

  // Follow the OS while "System (auto)" is chosen.
  if (mq) {
    var onOs = function () { if (choice === SYSTEM) apply(SYSTEM); };
    if (mq.addEventListener) mq.addEventListener('change', onOs); else if (mq.addListener) mq.addListener(onOs);
  }

  // If something else rewrites data-theme (an embedding host), put ours back.
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (root.getAttribute('data-theme') !== applied) apply(choice);
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.BleeprThemes = {
    SYSTEM: SYSTEM,
    list: THEMES,
    get: function (id) { return byId[id] || null; },
    vars: function (id) { return fullVars(byId[resolve(id)]); },
    resolve: resolve,
    choice: function () { return choice; },
    // Preview without saving.
    preview: function (id) { return apply(id); },
    // Choose and save.
    set: function (id) { choice = byId[id] || id === SYSTEM ? id : SYSTEM; writeChoice(choice); return apply(choice); },
    restore: function () { return apply(choice); }
  };
})();
