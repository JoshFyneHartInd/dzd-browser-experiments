// Wiring: owns the app state, connects the pure modules to the UI.
import { initThemePicker } from './theme-picker.js';
import {
  validateInput, createRoot, divide, join, countLeaves, nodeCidr, formatIPv4, parseIPv4, toCsv, toJson,
} from './subnet.js';
import { COLUMNS, defaultColumns, encodeState, decodeState } from './state.js';
import { createUI } from './ui.js';

const DEFAULT = { addr: parseIPv4('192.168.0.0'), bits: 24 };
const CSV_COLUMNS = {
  subnet: (i) => i.cidr,
  netmask: (i) => i.netmask,
  range: (i) => `${i.firstText} - ${i.lastText}`,
  usable: (i) => `${i.usableFirstText} - ${i.usableLastText}`,
  hosts: (i) => String(i.hosts),
};

let root;
let cols;
let applied; // the network last applied with Update (what Reset goes back to)

const ui = createUI({
  onUpdate: update,
  onReset: reset,
  onDivide(node) {
    if (!node || !divide(node)) return;
    ui.setFeedback('', '');
    commit();
    ui.focusRow(nodeCidr(node.children[0]));
    ui.announce(`Split ${nodeCidr(node)} into two /${node.children[0].bits} subnets.`);
  },
  onJoin(node) {
    if (!node) return;
    const count = countLeaves(node);
    if (!join(node)) return;
    ui.setFeedback('', '');
    commit();
    ui.focusRow(nodeCidr(node));
    ui.announce(`Joined ${count} subnets into ${nodeCidr(node)}.`);
  },
  onColumns(next) {
    cols = next;
    commit();
  },
  async onCopyCidr(cidr) {
    if (await copyText(cidr)) ui.setFeedback('success', `Copied ${cidr}.`);
    else ui.setFeedback('error', `Couldn't copy automatically. Select and copy ${cidr} by hand.`);
  },
  async onCopyLink() {
    persist();
    if (await copyText(shareUrl())) ui.setFeedback('success', 'Link copied to the clipboard.');
    else ui.setFeedback('error', "Couldn't copy automatically. Copy the link from the address bar instead.");
  },
  onExportJson() {
    const name = `subnets-${formatIPv4(root.addr)}-${root.bits}.json`;
    download(name, toJson(root, exportColumns().map((c) => c.id)), 'application/json');
    const n = countLeaves(root);
    ui.setFeedback('success', `Exported ${n} ${n === 1 ? 'subnet' : 'subnets'} to ${name}.`);
  },
  onExport() {
    const csv = toCsv(root, exportColumns().map((c) => ({ label: c.label, value: CSV_COLUMNS[c.id] })));
    const name = `subnets-${formatIPv4(root.addr)}-${root.bits}.csv`;
    download(name, csv, 'text/csv');
    const n = countLeaves(root);
    ui.setFeedback('success', `Exported ${n} ${n === 1 ? 'subnet' : 'subnets'} to ${name}.`);
  },
});

/** The data columns that are switched on (all five if none are), used by both CSV and JSON export. */
function exportColumns() {
  const all = COLUMNS.filter((c) => c.id in CSV_COLUMNS);
  const visible = all.filter((c) => cols[c.id]);
  return visible.length ? visible : all;
}

function update({ address, mask }) {
  const res = validateInput(address, mask);
  if (res.split) ui.setInputs({ address: res.address, mask: res.mask });
  if (!res.ok) {
    ui.showErrors(res.errors);
    return;
  }
  ui.clearErrors();
  ui.setFeedback('', '');
  applied = { addr: res.network, bits: res.bits };
  root = createRoot(res.network, res.bits);
  ui.setInputs({ address: formatIPv4(res.network), mask: String(res.bits) });
  ui.setNotice(res.hostBitsSet
    ? `${res.address}/${res.bits} has host bits set, so it was changed to the network address ${nodeCidr(root)}.`
    : '');
  commit();
  if (!res.hostBitsSet) ui.announce(`Showing ${nodeCidr(root)} as one subnet.`);
}

function reset() {
  root = createRoot(applied.addr, applied.bits);
  ui.clearErrors();
  ui.setNotice('');
  ui.setFeedback('', '');
  ui.setInputs({ address: formatIPv4(applied.addr), mask: String(applied.bits) });
  commit();
  ui.announce(`Reset to ${nodeCidr(root)}.`);
}

function commit() {
  persist();
  ui.setNetworkSummary(nodeCidr(root));
  ui.render({ root, cols });
}

function baseUrl() {
  return location.href.split('#')[0].split('?')[0];
}

function shareUrl() {
  return `${baseUrl()}?${encodeState({ root, cols })}`;
}

function persist() {
  try {
    history.replaceState(null, '', `?${encodeState({ root, cols })}`);
  } catch {
    /* Some browsers limit replaceState calls or block it on file:// pages; the share link is still built from state. */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- start ----
initThemePicker(document.getElementById('theme-select'));

const decoded = decodeState(location.search);
if (decoded.status === 'ok') {
  root = decoded.root;
  cols = decoded.cols;
} else {
  root = createRoot(DEFAULT.addr, DEFAULT.bits);
  cols = defaultColumns();
}
applied = { addr: root.addr, bits: root.bits };
ui.setInputs({ address: formatIPv4(root.addr), mask: String(root.bits) });
ui.setColumns(cols);
if (decoded.status === 'invalid') ui.setNotice("That link couldn't be read, so the default network is shown.");
commit();
