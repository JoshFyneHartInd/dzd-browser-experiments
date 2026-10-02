import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// themes.js is a classic script (`var THEMES = [...]`), so run it in a vm context.
const code = fs.readFileSync(new URL('../js/themes.js', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code + '\n;this.THEMES = THEMES;', sandbox);
const THEMES = sandbox.THEMES;

const TOKENS = ['--bg', '--surface', '--surface-2', '--border', '--fg', '--fg-muted', '--accent', '--accent-fg', '--danger'];
const GROUPS = ['Standard', 'Dark', 'Light'];

test('THEMES is a non-empty array', () => {
  assert.ok(Array.isArray(THEMES));
  assert.ok(THEMES.length > 0);
});

test('every id is unique', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every theme has a name, a valid group and scheme, and all tokens', () => {
  for (const t of THEMES) {
    assert.ok(typeof t.id === 'string' && t.id, 'id');
    assert.ok(typeof t.name === 'string' && t.name, `${t.id}: name`);
    assert.ok(GROUPS.includes(t.group), `${t.id}: group ${t.group}`);
    assert.ok(['light', 'dark'].includes(t.scheme), `${t.id}: scheme ${t.scheme}`);
    for (const token of TOKENS) {
      assert.match(t.vars[token] ?? '', /^#[0-9a-f]{6}$/i, `${t.id}: ${token}`);
    }
  }
});

test('midnight and paper exist, midnight is dark Standard', () => {
  const midnight = THEMES.find((t) => t.id === 'midnight');
  assert.ok(midnight);
  assert.equal(midnight.group, 'Standard');
  assert.equal(midnight.scheme, 'dark');
  const paper = THEMES.find((t) => t.id === 'paper');
  assert.ok(paper);
  assert.equal(paper.scheme, 'light');
});

test('tokens.css fallback matches Midnight', () => {
  const css = fs.readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  const midnight = THEMES.find((t) => t.id === 'midnight');
  for (const [k, v] of Object.entries(midnight.vars)) {
    assert.ok(css.toLowerCase().includes(`${k}: ${v.toLowerCase()}`), `tokens.css is missing ${k}: ${v}`);
  }
});
