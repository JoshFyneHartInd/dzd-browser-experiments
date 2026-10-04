// Tiny DOM helpers.
import { CONFIG } from './config.js';
import { gameClock } from './util.js';

export const ph = (name, cls = '') => `<i class="ph ph-${name} ${cls}" aria-hidden="true"></i>`;
export const clockText = (t) => {
  const c = gameClock(t, CONFIG.time.gameSecPerRealSec);
  return `D${c.day} ${String(c.hh).padStart(2, '0')}:${String(c.mm).padStart(2, '0')}`;
};

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Set text only when it changed (avoids needless layout work every frame). */
export function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
export function setAttr(el, name, val) {
  if (el && el.getAttribute(name) !== String(val)) el.setAttribute(name, val);
}
export function setClass(el, name, on) {
  if (el) el.classList.toggle(name, !!on);
}
