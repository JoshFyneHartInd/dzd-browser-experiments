import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIPv4, createRoot, divide, leaves, nodeCidr } from '../js/subnet.js';
import {
  COLUMNS, defaultColumns, columnsToNumber, numberToColumns, encodeTree, decodeTree,
  encodeState, decodeState, MAX_LEAVES,
} from '../js/state.js';

const shape = (root) => leaves(root).map(nodeCidr);

function sampleTree() {
  const root = createRoot(parseIPv4('10.0.0.0'), 16);
  divide(root);
  divide(root.children[0]);
  divide(root.children[1]);
  divide(root.children[1].children[0]);
  return root;
}

test('undivided network encodes to nothing and decodes back', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  assert.equal(encodeTree(root), '');
  assert.deepEqual(shape(decodeTree('', root.addr, root.bits)), ['192.168.0.0/24']);
});

test('simple division: pre-order bits 1,0,0 = 0b100 -> 0x80 -> "gA"', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  divide(root);
  assert.equal(encodeTree(root), 'gA');
});

test('tree round-trips', () => {
  const root = sampleTree();
  const text = encodeTree(root);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  const back = decodeTree(text, root.addr, root.bits);
  assert.deepEqual(shape(back), shape(root));
  assert.equal(encodeTree(back), text);
});

test('tree round-trips at the top of the address space and down to /32', () => {
  const root = createRoot(parseIPv4('255.255.255.252'), 30);
  divide(root);
  divide(root.children[1]);
  divide(root.children[1].children[1]);
  const back = decodeTree(encodeTree(root), root.addr, root.bits);
  assert.deepEqual(shape(back), ['255.255.255.252/31', '255.255.255.254/32', '255.255.255.255/32']);
});

test('/32 root has no tree data', () => {
  const root = createRoot(parseIPv4('1.2.3.4'), 32);
  assert.equal(encodeTree(root), '');
});

test('decodeTree rejects bad input', () => {
  const addr = parseIPv4('10.0.0.0');
  assert.equal(decodeTree('!!!', addr, 24), null, 'bad characters');
  assert.equal(decodeTree('A', addr, 24), null, 'a lone zero byte is not canonical');
  assert.equal(decodeTree('_', addr, 24), null, 'all ones runs out of bits');
  assert.equal(decodeTree('gAAA', addr, 24), null, 'extra bytes after the tree');
  assert.equal(decodeTree('gB', addr, 24), null, 'non-zero padding');
  assert.equal(decodeTree('g', addr, 24), null, 'invalid base64 length');
});

test('decodeTree refuses absurdly large trees', () => {
  // Every bit set: divide as far as the data allows, from /0, until we run out of bits or hit the cap.
  const bytes = new Uint8Array(4000).fill(0xff);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const text = btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  assert.equal(decodeTree(text, 0, 0), null);
  assert.ok(MAX_LEAVES > 0);
});

test('columns <-> number', () => {
  assert.equal(columnsToNumber(defaultColumns()), (1 << COLUMNS.length) - 1);
  const cols = { ...defaultColumns(), hosts: false, join: false };
  assert.deepEqual(numberToColumns(columnsToNumber(cols)), cols);
});

test('state round-trips through the query string', () => {
  const root = sampleTree();
  const cols = { ...defaultColumns(), netmask: false, usable: false };
  const q = encodeState({ root, cols });
  const out = decodeState('?' + q);
  assert.equal(out.status, 'ok');
  assert.deepEqual(shape(out.root), shape(root));
  assert.deepEqual(out.cols, cols);
  assert.equal(encodeState(out), q);
});

test('default state leaves t and c out', () => {
  const q = encodeState({ root: createRoot(parseIPv4('192.168.0.0'), 24), cols: defaultColumns() });
  assert.equal(q, 'n=192.168.0.0&m=24');
  const out = decodeState(q);
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.cols, defaultColumns());
});

test('decodeState: empty and invalid links', () => {
  assert.equal(decodeState('').status, 'empty');
  assert.equal(decodeState('?utm_source=x').status, 'empty');
  assert.equal(decodeState('?n=1.2.3.4').status, 'invalid');
  assert.equal(decodeState('?n=1.2.3.4&m=40').status, 'invalid');
  assert.equal(decodeState('?n=999.0.0.0&m=8').status, 'invalid');
  assert.equal(decodeState('?n=10.0.0.0&m=8&t=!!').status, 'invalid');
  assert.equal(decodeState('?n=10.0.0.0&m=8&c=999').status, 'invalid');
  assert.equal(decodeState('?n=10.0.0.0&m=8&c=abc').status, 'invalid');
});

test('decodeState normalizes host bits in the link', () => {
  const out = decodeState('?n=192.168.1.5&m=24');
  assert.equal(out.status, 'ok');
  assert.deepEqual(shape(out.root), ['192.168.1.0/24']);
});

test('high addresses survive a round trip', () => {
  const root = createRoot(parseIPv4('255.255.255.0'), 24);
  divide(root);
  const out = decodeState(encodeState({ root, cols: defaultColumns() }));
  assert.deepEqual(shape(out.root), ['255.255.255.0/25', '255.255.255.128/25']);
});
