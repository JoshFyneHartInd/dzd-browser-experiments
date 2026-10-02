// Pure IPv4 subnet math and division-tree operations. No DOM code in here.
// All addresses are unsigned 32-bit integers (kept unsigned with `>>> 0`).

export const MAX_BITS = 32;

const OCTET = /^(0|[1-9]\d{0,2})$/;

/** "192.168.0.1" -> 3232235521, or null if invalid. Leading zeros are rejected. */
export function parseIPv4(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** 3232235521 -> "192.168.0.1" */
export function formatIPv4(n) {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');
}

/** "24" or "/24" -> 24, or null if not a whole number from 0 to 32. */
export function parseMaskBits(text) {
  if (typeof text !== 'string') return null;
  const m = /^\/?(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const bits = Number(m[1]);
  return bits <= MAX_BITS ? bits : null;
}

/** Number of mask bits -> unsigned netmask. /0 is a special case (a shift by 32 is a shift by 0 in JS). */
export function maskFromBits(bits) {
  return bits === 0 ? 0 : (0xffffffff << (MAX_BITS - bits)) >>> 0;
}

/** Clear the host bits. */
export function networkOf(addr, bits) {
  return (addr & maskFromBits(bits)) >>> 0;
}

/** Number of addresses in a block. */
export function blockSize(bits) {
  return 2 ** (MAX_BITS - bits);
}

const MSG = {
  addressEmpty: 'Enter a network address, for example 192.168.0.0.',
  addressBad: 'Use four numbers from 0 to 255 separated by dots, for example 192.168.0.0.',
  maskEmpty: 'Enter mask bits from 0 to 32.',
  maskBad: 'Mask bits must be a whole number from 0 to 32.',
};

/**
 * Validate the two input fields. A CIDR pasted into the address field ("10.0.0.0/16")
 * is split automatically; `split` tells the caller that happened.
 */
export function validateInput(addressText, maskText) {
  let address = String(addressText ?? '').trim();
  let mask = String(maskText ?? '').trim();
  let split = false;
  const slash = address.indexOf('/');
  if (slash !== -1) {
    mask = address.slice(slash + 1).trim();
    address = address.slice(0, slash).trim();
    split = true;
  }
  const errors = {};
  const addr = address === '' ? null : parseIPv4(address);
  if (address === '') errors.address = MSG.addressEmpty;
  else if (addr === null) errors.address = MSG.addressBad;
  const bits = mask === '' ? null : parseMaskBits(mask);
  if (mask === '') errors.mask = MSG.maskEmpty;
  else if (bits === null) errors.mask = MSG.maskBad;
  if (errors.address || errors.mask) return { ok: false, errors, address, mask, split };
  const network = networkOf(addr, bits);
  return { ok: true, addr, bits, network, hostBitsSet: network !== addr, address, mask, split };
}

/** Everything the table shows about one subnet. */
export function subnetInfo(addr, bits) {
  const first = networkOf(addr, bits);
  const last = (first + blockSize(bits) - 1) >>> 0;
  let usableFirst;
  let usableLast;
  let hosts;
  let note = null;
  if (bits === 32) {
    usableFirst = first;
    usableLast = first;
    hosts = 1;
    note = 'Single host address';
  } else if (bits === 31) {
    usableFirst = first;
    usableLast = last;
    hosts = 2;
    note = 'Point-to-point link (RFC 3021): both addresses usable';
  } else {
    usableFirst = first + 1;
    usableLast = last - 1;
    hosts = blockSize(bits) - 2;
  }
  const f = formatIPv4(first);
  const l = formatIPv4(last);
  const uf = formatIPv4(usableFirst);
  const ul = formatIPv4(usableLast);
  return {
    cidr: `${f}/${bits}`,
    address: f,
    bits,
    netmask: formatIPv4(maskFromBits(bits)),
    first,
    last,
    firstText: f,
    lastText: l,
    rangeText: f === l ? f : `${f} – ${l}`,
    usableFirstText: uf,
    usableLastText: ul,
    usableText: uf === ul ? uf : `${uf} – ${ul}`,
    hosts,
    note,
  };
}

// ---- Division tree -------------------------------------------------------
// A node is { addr, bits, children: null | [lowerHalf, upperHalf] }.

export function createRoot(addr, bits) {
  return { addr: networkOf(addr, bits), bits, children: null };
}

export function nodeCidr(node) {
  return `${formatIPv4(node.addr)}/${node.bits}`;
}

export function isLeaf(node) {
  return node.children === null;
}

export function canDivide(node) {
  return node.children === null && node.bits < MAX_BITS;
}

/** Split a leaf into two halves. Returns false if it can't be split. */
export function divide(node) {
  if (!canDivide(node)) return false;
  const bits = node.bits + 1;
  const half = blockSize(bits);
  node.children = [
    { addr: node.addr, bits, children: null },
    { addr: (node.addr + half) >>> 0, bits, children: null },
  ];
  return true;
}

/** Collapse a node's whole subtree back into the node. Returns false for a leaf. */
export function join(node) {
  if (node.children === null) return false;
  node.children = null;
  return true;
}

export function countLeaves(node) {
  return node.children === null ? 1 : countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/** Leaves in address order. */
export function leaves(root) {
  const out = [];
  (function walk(n) {
    if (n.children === null) out.push(n);
    else {
      walk(n.children[0]);
      walk(n.children[1]);
    }
  })(root);
  return out;
}

/**
 * Rows for rendering, in address order. Each row is { node, depth, joins }.
 * `joins` lists the internal nodes whose bracket STARTS at this row, deepest first
 * (the order they appear left to right), each as { node, span, depth }.
 * `maxDepth` is the number of bracket columns needed.
 */
export function layoutRows(root) {
  const rows = [];
  let maxDepth = 0;
  (function walk(node, depth) {
    if (node.children === null) {
      rows.push({ node, depth, joins: [] });
      if (depth > maxDepth) maxDepth = depth;
      return;
    }
    const start = rows.length;
    walk(node.children[0], depth + 1);
    walk(node.children[1], depth + 1);
    rows[start].joins.push({ node, span: rows.length - start, depth });
  })(root, 0);
  return { rows, maxDepth };
}

export function totalHosts(root) {
  return leaves(root).reduce((sum, n) => sum + subnetInfo(n.addr, n.bits).hosts, 0);
}

/** Build CSV text. `fields` are functions taking a subnetInfo and returning a string. */
export function toCsv(root, columns) {
  const quote = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = [columns.map((c) => quote(c.label)).join(',')];
  for (const leaf of leaves(root)) {
    const info = subnetInfo(leaf.addr, leaf.bits);
    lines.push(columns.map((c) => quote(c.value(info))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
