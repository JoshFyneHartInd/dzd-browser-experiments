// Rendering, events, focus and announcements. Holds no application state:
// main.js owns the data and passes it to render().
import { layoutRows, subnetInfo, canDivide, nodeCidr, totalHosts, sizeShare } from './subnet.js';
import { COLUMNS } from './state.js';

const nf = new Intl.NumberFormat();
const DATA_COLUMNS = ['subnet', 'netmask', 'range', 'usable', 'hosts'];
const LABELS = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
const icon = (name) => `<span class="icon" aria-hidden="true">${name}</span>`;

function value(id, info) {
  switch (id) {
    case 'netmask': return info.netmask;
    case 'range': return info.rangeText;
    case 'usable': return info.usableText;
    case 'hosts': return nf.format(info.hosts);
    default: return info.cidr;
  }
}

export function createUI(h) {
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('network-form'), address: $('address'), mask: $('mask'),
    addressError: $('address-error'), maskError: $('mask-error'),
    notice: $('notice'), feedback: $('feedback'), live: $('live'),
    results: $('results'), summary: $('summary'), columns: $('columns'),
    reset: $('reset'), networkDetails: $('network-details'), networkSummary: $('network-summary'),
    helpButton: $('help-button'), helpDialog: $('help-dialog'), helpClose: $('help-close'), copyLink: $('copy-link'), exportCsv: $('export-csv'), exportJson: $('export-json'), tooltip: $('tooltip'),
  };
  const wide = matchMedia('(min-width: 40rem)'); // Tailwind's `sm`

  let model = null;
  let nodes = new Map();

  // ---- messages ----------------------------------------------------------
  function setMessage(el, kind, text) {
    if (!text) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const symbol = { error: 'error', info: 'info', success: 'check_circle' }[kind];
    const i = document.createElement('span');
    i.className = 'icon';
    i.setAttribute('aria-hidden', 'true');
    i.textContent = symbol;
    const t = document.createElement('span');
    t.textContent = text;
    el.dataset.kind = kind;
    el.replaceChildren(i, t);
    el.hidden = false;
  }

  let liveTimer = 0;
  function announce(text) {
    els.live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { els.live.textContent = text; }, 60);
  }

  // Visible message that is also spoken.
  function setFeedback(kind, text) {
    setMessage(els.feedback, kind, text);
    if (text) announce(text);
  }

  function setNotice(text) {
    setMessage(els.notice, 'info', text);
    if (text) announce(text);
  }

  function showErrors(errors) {
    setMessage(els.addressError, 'error', errors.address || '');
    setMessage(els.maskError, 'error', errors.mask || '');
    els.address.toggleAttribute('aria-invalid', Boolean(errors.address));
    els.mask.toggleAttribute('aria-invalid', Boolean(errors.mask));
    if (errors.address) els.address.setAttribute('aria-invalid', 'true');
    if (errors.mask) els.mask.setAttribute('aria-invalid', 'true');
    const bad = errors.address ? els.address : errors.mask ? els.mask : null;
    if (bad) {
      els.networkDetails.open = true; // the field must be visible to take focus
      bad.focus();
    }
  }

  function clearErrors() {
    showErrors({});
  }

  function setInputs({ address, mask }) {
    els.address.value = address;
    els.mask.value = mask;
  }

  // ---- columns -----------------------------------------------------------
  function buildColumnChecks() {
    els.columns.innerHTML = COLUMNS.map((c) => `
      <label class="inline-flex tap items-center gap-2 text-sm">
        <input type="checkbox" data-col="${c.id}" class="size-5 accent-accent">${c.label}
      </label>`).join('');
  }

  function getColumns() {
    const cols = {};
    els.columns.querySelectorAll('input[data-col]').forEach((cb) => { cols[cb.dataset.col] = cb.checked; });
    return cols;
  }

  function setColumns(cols) {
    els.columns.querySelectorAll('input[data-col]').forEach((cb) => { cb.checked = Boolean(cols[cb.dataset.col]); });
  }

  // ---- rendering ---------------------------------------------------------
  function copyButton(cidr) {
    return `<button type="button" class="btn btn-icon" data-action="copy" data-cidr="${cidr}"
      aria-label="Copy ${cidr}" data-tip="Copy ${cidr}">${icon('content_copy')}</button>`;
  }

  function divideButton(cidr, node) {
    const can = canDivide(node);
    // The label shows the row's current size, e.g. "Split /26" on a /26 row (it becomes two /27s).
    const name = can ? `Split /${node.bits} subnet ${cidr} into two /${node.bits + 1} subnets` : `Split /${node.bits} subnet ${cidr} (can't be split further)`;
    return `<button type="button" class="btn whitespace-nowrap" data-action="divide" data-cidr="${cidr}" aria-disabled="${!can}"
      aria-label="${name}">${icon('call_split')}<span>Split /${node.bits}</span></button>`;
  }

  function noteHtml(info, cols) {
    if (!info.note) return '';
    // Show the note once, next to whichever of these columns is visible.
    return `<p class="mt-0.5 text-xs text-fg-muted">${info.note}</p>`;
  }

  function noteColumn(cols) {
    return cols.usable ? 'usable' : cols.hosts ? 'hosts' : null;
  }

  function tableHtml(rows, maxDepth, cols) {
    const dataCols = DATA_COLUMNS.filter((id) => cols[id]);
    const showJoin = cols.join && maxDepth > 0;
    const noteIn = noteColumn(cols);
    const root = rows.length ? `Subnets of ${nodeCidr(model.root)}` : 'Subnets';
    let h = '<div class="overflow-x-auto rounded-lg border border-border bg-surface"><table class="w-full border-separate border-spacing-0 text-left text-sm">';
    h += `<caption class="sr-only">${root}</caption><thead><tr class="bg-surface-2">`;
    for (const id of dataCols) h += `<th scope="col" data-datacol class="px-2 py-1.5 font-semibold whitespace-nowrap">${LABELS[id]}</th>`;
    if (cols.divide) h += `<th scope="col" class="px-2 py-1.5 font-semibold">${LABELS.divide}</th>`;
    if (showJoin) h += `<th scope="col" colspan="${maxDepth}" class="px-2 py-1.5 font-semibold">${LABELS.join}</th>`;
    h += '</tr></thead><tbody>';
    rows.forEach((row) => {
      const info = subnetInfo(row.node.addr, row.node.bits);
      const cidr = info.cidr;
      const share = sizeShare(row.node, model.root);
      h += `<tr data-row="${cidr}" tabindex="-1" class="bg-surface hover:bg-surface-2">`;
      dataCols.forEach((id, n) => {
        const note = noteIn === id ? noteHtml(info, cols) : '';
        const isFirst = n === 0;
        const first = isFirst ? 'size-cell pb-1 ' : '';
        const bar = isFirst ? `<span class="size-bar" aria-hidden="true" style="--share:${share}"></span>` : '';
        if (id === 'subnet') {
          h += `<th scope="row" class="${first}border-t border-border px-2 py-0.5 text-left font-medium whitespace-nowrap"><span class="inline-flex items-center gap-2">${copyButton(cidr)}<span class="font-mono">${cidr}</span></span>${bar}</th>`;
        } else {
          h += `<td class="${first}border-t border-border px-2 py-0.5 ${id === 'hosts' ? 'text-right ' : ''}font-mono tabular-nums ${id === 'usable' || id === 'range' ? 'whitespace-nowrap' : ''}">${value(id, info)}${note}${bar}</td>`;
        }
      });
      if (cols.divide) h += `<td class="border-t border-border px-2 py-0.5">${divideButton(cidr, row.node)}</td>`;
      if (showJoin) {
        if (row.depth < maxDepth) h += `<td colspan="${maxDepth - row.depth}" class="border-t border-border"></td>`;
        for (const j of row.joins) {
          const jc = nodeCidr(j.node);
          h += `<td rowspan="${j.span}" class="join-cell border-t border-border"><button type="button" class="bracket" data-action="join" data-cidr="${jc}" data-parity="${j.depth % 2}" aria-label="Join into ${jc}">${icon('merge')}<span>/${j.node.bits}</span></button></td>`;
        }
      }
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function cardsHtml(rows, cols) {
    const noteIn = noteColumn(cols);
    // Card order puts the short fields side by side: netmask | hosts, then the two ranges full width.
    const CARD_FIELDS = ['netmask', 'hosts', 'range', 'usable'];
    let h = '<ol class="m-0 list-none space-y-2 p-0">';
    for (const row of rows) {
      const info = subnetInfo(row.node.addr, row.node.bits);
      const cidr = info.cidr;
      const indent = Math.min(row.depth, 5) * 0.5;
      const fields = CARD_FIELDS.filter((id) => cols[id]);
      h += `<li data-row="${cidr}" tabindex="-1" class="card rounded-lg border border-border bg-surface p-2.5" style="margin-left:${indent}rem;--indent:${indent}rem">`;
      // Header: copy, address, and Split on the right, all on one line.
      h += '<div class="flex items-center gap-2">';
      if (cols.subnet) h += copyButton(cidr);
      h += `<h3 class="card-title min-w-0 flex-1 font-mono text-base font-semibold${cols.subnet ? '' : ' sr-only'}">${cidr}</h3>`;
      if (cols.divide) h += `<span class="ml-auto">${divideButton(cidr, row.node)}</span>`;
      h += '</div>';
      if (fields.length) {
        h += '<dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">';
        for (const id of fields) {
          const span = id === 'range' || id === 'usable' ? ' col-span-2' : '';
          h += `<div class="min-w-0${span}"><dt class="text-xs text-fg-muted">${LABELS[id]}</dt><dd class="font-mono text-sm tabular-nums" style="overflow-wrap:anywhere">${value(id, info)}</dd></div>`;
        }
        h += '</dl>';
      }
      if (info.note && noteIn) h += noteHtml(info, cols);
      if (cols.join && row.joins.length > 0) {
        h += '<div class="mt-2 flex flex-wrap gap-2">';
        for (const j of row.joins) {
          const jc = nodeCidr(j.node);
          h += `<button type="button" class="bracket bracket-inline" data-action="join" data-cidr="${jc}" data-parity="${j.depth % 2}" aria-label="Join into ${jc}">${icon('merge')}<span>Join /${j.node.bits}</span></button>`;
        }
        h += '</div>';
      }
      h += `<div class="size-track mt-2" aria-hidden="true"><span class="size-bar" style="--share:${sizeShare(row.node, model.root)}"></span></div>`;
      h += '</li>';
    }
    return h + '</ol>';
  }

  function render(next) {
    model = next;
    const { rows, maxDepth } = layoutRows(model.root);
    nodes = new Map();
    for (const row of rows) {
      nodes.set(nodeCidr(row.node), row.node);
      for (const j of row.joins) nodes.set(nodeCidr(j.node), j.node);
    }
    const count = rows.length;
    els.summary.textContent = `${nf.format(count)} ${count === 1 ? 'subnet' : 'subnets'}, ${nf.format(totalHosts(model.root))} usable ${totalHosts(model.root) === 1 ? 'host' : 'hosts'} in total`;
    els.results.innerHTML = wide.matches ? tableHtml(rows, maxDepth, model.cols) : cardsHtml(rows, model.cols);
    watchBarSpan();
  }

  // The size bar runs from the left edge of the first data column to the right edge of the last one
  // (the Split column starts right after). CSS can't know that distance, so measure it.
  let spanObserver = null;
  function measureBarSpan() {
    const table = els.results.querySelector('table');
    const heads = table ? table.querySelectorAll('th[data-datacol]') : [];
    if (heads.length === 0) return;
    const span = heads[heads.length - 1].getBoundingClientRect().right - heads[0].getBoundingClientRect().left;
    if (span > 0) table.style.setProperty('--bar-span', `${span}px`);
  }
  function watchBarSpan() {
    if (spanObserver) spanObserver.disconnect();
    measureBarSpan();
    if (typeof ResizeObserver !== 'function') return;
    spanObserver = new ResizeObserver(measureBarSpan);
    els.results.querySelectorAll('th[data-datacol]').forEach((th) => spanObserver.observe(th));
  }

  /** Put keyboard focus on a sensible control in the row with this CIDR. */
  function focusRow(cidr) {
    const row = els.results.querySelector(`[data-row="${cidr}"]`);
    if (!row) return;
    const target = row.querySelector('[data-action="divide"]')
      || row.querySelector('[data-action="copy"]')
      || row.querySelector('[data-action="join"]')
      || row;
    target.focus();
  }

  // ---- tooltip -----------------------------------------------------------
  let tipTarget = null;
  let tipTimer = 0;
  function showTip(btn) {
    clearTimeout(tipTimer);
    tipTarget = btn;
    const tip = els.tooltip;
    tip.textContent = btn.dataset.tip;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(4, Math.min(left, document.documentElement.clientWidth - t.width - 4));
    let top = r.top - t.height + 2;
    if (top < 4) top = r.bottom - 2;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function hideTip(delay = 0) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      els.tooltip.hidden = true;
      tipTarget = null;
    }, delay);
  }

  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest?.('[data-tip]');
    if (b) showTip(b);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('[data-tip]')) hideTip(150);
  });
  document.addEventListener('focusin', (e) => {
    const b = e.target.closest?.('[data-tip]');
    if (b) showTip(b);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.closest?.('[data-tip]')) hideTip(0);
  });
  els.tooltip.addEventListener('mouseenter', () => clearTimeout(tipTimer));
  els.tooltip.addEventListener('mouseleave', () => hideTip(0));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.tooltip.hidden) hideTip(0);
  });
  window.addEventListener('scroll', () => { if (!els.tooltip.hidden) hideTip(0); }, { passive: true });

  // ---- events ------------------------------------------------------------
  els.results.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const cidr = btn.dataset.cidr;
    if (btn.dataset.action === 'copy') h.onCopyCidr(cidr);
    else if (btn.dataset.action === 'divide') h.onDivide(nodes.get(cidr));
    else if (btn.dataset.action === 'join') h.onJoin(nodes.get(cidr));
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    h.onUpdate({ address: els.address.value, mask: els.mask.value });
  });

  // A pasted CIDR is split into the two fields straight away.
  els.address.addEventListener('paste', () => {
    setTimeout(() => {
      const v = els.address.value;
      const slash = v.indexOf('/');
      if (slash === -1) return;
      els.mask.value = v.slice(slash + 1).trim();
      els.address.value = v.slice(0, slash).trim();
    }, 0);
  });

  els.helpButton.addEventListener('click', () => {
    hideTip(0);
    if (typeof els.helpDialog.showModal === 'function') els.helpDialog.showModal();
    else els.helpDialog.setAttribute('open', '');
  });
  els.helpClose.addEventListener('click', () => els.helpDialog.close());
  // A click on the dimmed backdrop (the dialog element itself) closes it too.
  els.helpDialog.addEventListener('click', (e) => { if (e.target === els.helpDialog) els.helpDialog.close(); });

  function setNetworkSummary(text) {
    els.networkSummary.textContent = text;
  }

  els.reset.addEventListener('click', () => h.onReset());
  els.copyLink.addEventListener('click', () => h.onCopyLink());
  els.exportCsv.addEventListener('click', () => h.onExport());
  els.exportJson.addEventListener('click', () => h.onExportJson());
  els.columns.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-col]');
    if (cb) h.onColumns(getColumns(), cb.dataset.col, cb.checked);
  });
  wide.addEventListener('change', () => { if (model) render(model); });

  buildColumnChecks();

  return { render, focusRow, announce, setFeedback, setNotice, showErrors, clearErrors, setInputs, setColumns, getColumns, setNetworkSummary };
}
