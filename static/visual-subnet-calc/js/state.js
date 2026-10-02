// URL state: network, mask, division tree and visible columns.
// Format is documented in the README. No DOM code in here.
import { parseIPv4, parseMaskBits, networkOf, createRoot, formatIPv4, MAX_BITS, blockSize } from './subnet.js';

export const COLUMNS = [
  { id: 'subnet', label: 'Subnet address' },
  { id: 'netmask', label: 'Netmask' },
  { id: 'range', label: 'Range of addresses' },
  { id: 'usable', label: 'Usable IPs' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'divide', label: 'Split' },
  { id: 'join', label: 'Join' },
];

/** Links with more leaves than this are treated as invalid (protects the page from a huge render). */
export const MAX_LEAVES = 4096;

export function defaultColumns() {
  return Object.fromEntries(COLUMNS.map((c) => [c.id, true]));
}

const ALL_MASK = (1 << COLUMNS.length) - 1;

export function columnsToNumber(cols) {
  return COLUMNS.reduce((n, c, i) => (cols[c.id] ? n | (1 << i) : n), 0);
}

export function numberToColumns(n) {
  return Object.fromEntries(COLUMNS.map((c, i) => [c.id, (n & (1 << i)) !== 0]));
}

// ---- base64url -----------------------------------------------------------

function bytesToBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const b64 = text.replaceAll('-', '+').replaceAll('_', '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

// ---- Tree ----------------------------------------------------------------

/**
 * Pre-order traversal, one bit per node: 1 = divided, 0 = leaf. A /32 can't be divided,
 * so it gets no bit. Bits are packed most-significant-first, zero padded, then base64url.
 * An undivided network encodes to the empty string.
 */
export function encodeTree(root) {
  const bits = [];
  (function walk(n) {
    if (n.bits === MAX_BITS) return;
    if (n.children) {
      bits.push(1);
      walk(n.children[0]);
      walk(n.children[1]);
    } else {
      bits.push(0);
    }
  })(root);
  if (!bits.includes(1)) return '';
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, i) => {
    if (bit) bytes[i >> 3] |= 0x80 >> (i & 7);
  });
  return bytesToBase64Url(bytes);
}

/** Rebuild a tree. Returns null if the text is malformed (not canonical, truncated, too big). */
export function decodeTree(text, addr, bits) {
  const root = createRoot(addr, bits);
  if (text === '') return root;
  const bytes = base64UrlToBytes(text);
  if (!bytes || bytes.length === 0) return null;
  const total = bytes.length * 8;
  let pos = 0;
  let leafCount = 0;
  const readBit = () => {
    if (pos >= total) throw new Error('truncated');
    const bit = (bytes[pos >> 3] >> (7 - (pos & 7))) & 1;
    pos += 1;
    return bit;
  };
  const build = (node) => {
    if (node.bits === MAX_BITS || readBit() === 0) {
      leafCount += 1;
      if (leafCount > MAX_LEAVES) throw new Error('too many subnets');
      return;
    }
    const childBits = node.bits + 1;
    node.children = [
      { addr: node.addr, bits: childBits, children: null },
      { addr: (node.addr + blockSize(childBits)) >>> 0, bits: childBits, children: null },
    ];
    build(node.children[0]);
    build(node.children[1]);
  };
  try {
    build(root);
    // Only zero padding (less than one byte) may follow the tree.
    if (total - pos >= 8) return null;
    while (pos < total) if (readBit() !== 0) return null;
  } catch {
    return null;
  }
  // Only the canonical spelling is accepted (atob quietly ignores stray bits in the last character).
  return encodeTree(root) === text ? root : null;
}

// ---- Whole state <-> query string ---------------------------------------

/** { root, cols } -> "n=192.168.0.0&m=24&t=...&c=..." (t and c are left out when they are the default). */
export function encodeState({ root, cols }) {
  const p = new URLSearchParams();
  p.set('n', formatIPv4(root.addr));
  p.set('m', String(root.bits));
  const tree = encodeTree(root);
  if (tree) p.set('t', tree);
  const c = columnsToNumber(cols);
  if (c !== ALL_MASK) p.set('c', String(c));
  return p.toString();
}

/**
 * Read a query string. Returns
 *   { status: 'empty' }                      nothing relevant in the link
 *   { status: 'invalid' }                    something was there but couldn't be read
 *   { status: 'ok', root, cols }
 */
export function decodeState(query) {
  const p = new URLSearchParams(query);
  if (!['n', 'm', 't', 'c'].some((k) => p.has(k))) return { status: 'empty' };
  const addr = parseIPv4(p.get('n') ?? '');
  const bits = parseMaskBits(p.get('m') ?? '');
  if (addr === null || bits === null) return { status: 'invalid' };
  const root = decodeTree(p.get('t') ?? '', networkOf(addr, bits), bits);
  if (!root) return { status: 'invalid' };
  let cols = defaultColumns();
  if (p.has('c')) {
    const raw = p.get('c');
    if (!/^\d{1,3}$/.test(raw) || Number(raw) > ALL_MASK) return { status: 'invalid' };
    cols = numberToColumns(Number(raw));
  }
  return { status: 'ok', root, cols };
}
