import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIPv4, formatIPv4, parseMaskBits, maskFromBits, networkOf, validateInput, subnetInfo,
  createRoot, divide, join, canDivide, leaves, layoutRows, countLeaves, totalHosts, nodeCidr, toCsv, toJson, sizeShare,
} from '../js/subnet.js';

test('parseIPv4 accepts valid addresses, including ones above 128.0.0.0', () => {
  assert.equal(parseIPv4('0.0.0.0'), 0);
  assert.equal(parseIPv4('192.168.0.1'), 3232235521);
  assert.equal(parseIPv4('255.255.255.255'), 4294967295);
  assert.equal(parseIPv4(' 10.0.0.1 '), 167772161);
});

test('parseIPv4 rejects invalid addresses', () => {
  for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.0.0.0', '1.2.3.-4', 'a.b.c.d', '01.2.3.4', '1..3.4', '1.2.3.4/24', null, undefined]) {
    assert.equal(parseIPv4(bad), null, String(bad));
  }
});

test('formatIPv4 round-trips and stays unsigned', () => {
  for (const ip of ['0.0.0.0', '128.0.0.0', '255.255.255.255', '192.168.1.1']) {
    assert.equal(formatIPv4(parseIPv4(ip)), ip);
  }
});

test('parseMaskBits', () => {
  assert.equal(parseMaskBits('24'), 24);
  assert.equal(parseMaskBits('/24'), 24);
  assert.equal(parseMaskBits('0'), 0);
  assert.equal(parseMaskBits('32'), 32);
  for (const bad of ['33', '-1', '', 'x', '2.5', '100', '/']) assert.equal(parseMaskBits(bad), null, bad);
});

test('maskFromBits handles /0 and /32', () => {
  assert.equal(formatIPv4(maskFromBits(0)), '0.0.0.0');
  assert.equal(formatIPv4(maskFromBits(1)), '128.0.0.0');
  assert.equal(formatIPv4(maskFromBits(24)), '255.255.255.0');
  assert.equal(formatIPv4(maskFromBits(31)), '255.255.255.254');
  assert.equal(formatIPv4(maskFromBits(32)), '255.255.255.255');
});

test('validateInput: normal, split CIDR, host bits, errors', () => {
  const ok = validateInput('192.168.0.0', '24');
  assert.equal(ok.ok, true);
  assert.equal(ok.hostBitsSet, false);

  const split = validateInput('10.0.0.0/16', '');
  assert.equal(split.ok, true);
  assert.equal(split.split, true);
  assert.equal(split.bits, 16);
  assert.equal(split.address, '10.0.0.0');
  assert.equal(split.mask, '16');

  const host = validateInput('192.168.1.5', '24');
  assert.equal(host.ok, true);
  assert.equal(host.hostBitsSet, true);
  assert.equal(formatIPv4(host.network), '192.168.1.0');

  const bad = validateInput('999.1.1.1', '40');
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.address);
  assert.ok(bad.errors.mask);

  assert.ok(validateInput('', '24').errors.address);
  assert.ok(validateInput('1.2.3.4', '').errors.mask);
  assert.ok(validateInput('1.2.3.4/24/5', '').errors.mask);
});

test('subnetInfo for a /24', () => {
  const i = subnetInfo(parseIPv4('192.168.0.0'), 24);
  assert.equal(i.cidr, '192.168.0.0/24');
  assert.equal(i.netmask, '255.255.255.0');
  assert.equal(i.rangeText, '192.168.0.0 – 192.168.0.255');
  assert.equal(i.usableText, '192.168.0.1 – 192.168.0.254');
  assert.equal(i.hosts, 254);
  assert.equal(i.note, null);
});

test('subnetInfo for /0, /31 and /32', () => {
  const all = subnetInfo(0, 0);
  assert.equal(all.rangeText, '0.0.0.0 – 255.255.255.255');
  assert.equal(all.hosts, 4294967294);

  const p2p = subnetInfo(parseIPv4('10.0.0.4'), 31);
  assert.equal(p2p.hosts, 2);
  assert.equal(p2p.usableText, '10.0.0.4 – 10.0.0.5');
  assert.ok(p2p.note);

  const one = subnetInfo(parseIPv4('10.0.0.7'), 32);
  assert.equal(one.hosts, 1);
  assert.equal(one.usableText, '10.0.0.7');
  assert.equal(one.rangeText, '10.0.0.7');
  assert.ok(one.note);
});

test('subnetInfo works at the top of the address space', () => {
  const i = subnetInfo(parseIPv4('255.255.255.0'), 24);
  assert.equal(i.cidr, '255.255.255.0/24');
  assert.equal(i.rangeText, '255.255.255.0 – 255.255.255.255');
  assert.equal(i.usableText, '255.255.255.1 – 255.255.255.254');
  assert.equal(i.hosts, 254);
  assert.equal(networkOf(parseIPv4('200.1.2.3'), 8), parseIPv4('200.0.0.0'));
});

test('divide and join', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  assert.equal(canDivide(root), true);
  assert.equal(divide(root), true);
  assert.equal(divide(root), false, 'already divided');
  assert.deepEqual(leaves(root).map(nodeCidr), ['192.168.0.0/25', '192.168.0.128/25']);

  divide(root.children[1]);
  assert.deepEqual(leaves(root).map(nodeCidr), ['192.168.0.0/25', '192.168.0.128/26', '192.168.0.192/26']);
  assert.equal(countLeaves(root), 3);

  assert.equal(join(root.children[1]), true);
  assert.equal(join(root.children[1]), false, 'already a leaf');
  assert.equal(countLeaves(root), 2);
  assert.equal(join(root), true);
  assert.equal(countLeaves(root), 1);
});

test('divide above 128.0.0.0 and down to /32', () => {
  const root = createRoot(parseIPv4('255.255.255.254'), 31);
  divide(root);
  assert.deepEqual(leaves(root).map(nodeCidr), ['255.255.255.254/32', '255.255.255.255/32']);
  assert.equal(canDivide(root.children[0]), false);
  assert.equal(divide(root.children[0]), false);

  const top = createRoot(0, 0);
  divide(top);
  assert.deepEqual(leaves(top).map(nodeCidr), ['0.0.0.0/1', '128.0.0.0/1']);
});

test('createRoot normalizes host bits', () => {
  assert.equal(nodeCidr(createRoot(parseIPv4('192.168.1.5'), 24)), '192.168.1.0/24');
});

test('layoutRows: brackets start at the right rows, deepest first', () => {
  // /24 -> two /25; the lower /25 -> two /26; the lower /26 -> two /27
  const root = createRoot(parseIPv4('10.0.0.0'), 24);
  divide(root);
  divide(root.children[0]);
  divide(root.children[0].children[0]);
  const { rows, maxDepth } = layoutRows(root);
  assert.equal(maxDepth, 3);
  assert.deepEqual(rows.map((r) => r.depth), [3, 3, 2, 1]);
  assert.deepEqual(rows.map((r) => nodeCidr(r.node)), ['10.0.0.0/27', '10.0.0.32/27', '10.0.0.64/26', '10.0.0.128/25']);
  // Row 0 starts the /26 bracket (2 rows... no: /27 is the deepest) then /25 then /24
  assert.deepEqual(rows[0].joins.map((j) => [nodeCidr(j.node), j.span, j.depth]), [
    ['10.0.0.0/26', 2, 2],
    ['10.0.0.0/25', 3, 1],
    ['10.0.0.0/24', 4, 0],
  ]);
  assert.deepEqual(rows[1].joins, []);
  assert.deepEqual(rows[2].joins, []);
  assert.deepEqual(rows[3].joins, []);
});

test('layoutRows: undivided network has no brackets', () => {
  const { rows, maxDepth } = layoutRows(createRoot(0, 8));
  assert.equal(maxDepth, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].joins, []);
});

test('every internal node gets exactly one bracket', () => {
  const root = createRoot(parseIPv4('172.16.0.0'), 20);
  divide(root);
  divide(root.children[0]);
  divide(root.children[1]);
  divide(root.children[1].children[1]);
  const { rows } = layoutRows(root);
  const internal = rows.flatMap((r) => r.joins);
  assert.equal(internal.length, countLeaves(root) - 1);
  const spanTotal = internal.filter((j) => j.depth === 0).reduce((s, j) => s + j.span, 0);
  assert.equal(spanTotal, countLeaves(root));
});

test('totalHosts adds up usable hosts of every subnet', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  divide(root);
  assert.equal(totalHosts(root), 126 + 126);
});

test('toCsv quotes values and uses CRLF', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  divide(root);
  const csv = toCsv(root, [
    { label: 'Subnet address', value: (i) => i.cidr },
    { label: 'Hosts, usable', value: (i) => String(i.hosts) },
  ]);
  assert.equal(csv, '"Subnet address","Hosts, usable"\r\n"192.168.0.0/25","126"\r\n"192.168.0.128/25","126"\r\n');
});

test('toJson with all columns lists every field for every subnet, including /31 and /32', () => {
  const root = createRoot(parseIPv4('10.0.0.0'), 30);
  divide(root);
  divide(root.children[1]);
  const out = JSON.parse(toJson(root));
  assert.equal(out.network, '10.0.0.0/30');
  assert.equal(out.subnetCount, 3);
  assert.equal(out.totalUsableHosts, 2 + 1 + 1);
  assert.deepEqual(out.subnets[0], {
    cidr: '10.0.0.0/31', netmask: '255.255.255.254',
    firstAddress: '10.0.0.0', lastAddress: '10.0.0.1', firstUsable: '10.0.0.0', lastUsable: '10.0.0.1', usableHosts: 2,
  });
  assert.equal(out.subnets[2].cidr, '10.0.0.3/32');
  assert.equal(out.subnets[2].firstUsable, '10.0.0.3');
  assert.equal(out.subnets[2].usableHosts, 1);
});

test('toJson only includes the selected columns', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  divide(root);
  const some = JSON.parse(toJson(root, ['subnet', 'range']));
  assert.deepEqual(Object.keys(some), ['network', 'subnetCount', 'subnets']);
  assert.deepEqual(some.subnets[0], { cidr: '192.168.0.0/25', firstAddress: '192.168.0.0', lastAddress: '192.168.0.127' });

  const hostsOnly = JSON.parse(toJson(root, ['hosts']));
  assert.equal(hostsOnly.totalUsableHosts, 252);
  assert.deepEqual(hostsOnly.subnets, [{ usableHosts: 126 }, { usableHosts: 126 }]);

  const mask = JSON.parse(toJson(root, ['netmask']));
  assert.ok(!('totalUsableHosts' in mask));
  assert.deepEqual(mask.subnets[1], { netmask: '255.255.255.128' });
});

test('sizeShare is the fraction of the network a subnet covers', () => {
  const root = createRoot(parseIPv4('192.168.0.0'), 24);
  assert.equal(sizeShare(root, root), 1);
  divide(root);
  divide(root.children[1]);
  assert.deepEqual(leaves(root).map((n) => sizeShare(n, root)), [0.5, 0.25, 0.25]);
  const all = leaves(root).reduce((sum, n) => sum + sizeShare(n, root), 0);
  assert.equal(all, 1);
});
