import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { THEME_KEY, nextTheme, resolveTheme, storedTheme, themeColor } from '../docs/js/theme.js';

/** localStorage stand-in holding raw strings; `broken` throws like Safari private mode used to. */
function fakeStorage(initial = {}, { broken = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      if (broken) throw new Error('denied');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (broken) throw new Error('denied');
      data.set(key, String(value));
    },
    data,
  };
}

/** matchMedia stand-in: `light` is whether the device prefers light; undefined = no support. */
const fakeMatchMedia = (light) => (query) => ({ media: query, matches: query === '(prefers-color-scheme: light)' && light });

test('the key is shared by real and sandbox mode', () => {
  assert.equal(THEME_KEY, 'sjineser:theme');
});

test('storedTheme returns only a valid explicit choice', () => {
  assert.equal(storedTheme(fakeStorage({ [THEME_KEY]: 'light' })), 'light');
  assert.equal(storedTheme(fakeStorage({ [THEME_KEY]: 'dark' })), 'dark');
  assert.equal(storedTheme(fakeStorage({ [THEME_KEY]: 'pink' })), null);
  assert.equal(storedTheme(fakeStorage()), null);
  assert.equal(storedTheme(fakeStorage({}, { broken: true })), null);
  assert.equal(storedTheme(undefined), null);
});

test('resolveTheme: an explicit choice wins over the device', () => {
  assert.equal(resolveTheme({ storage: fakeStorage({ [THEME_KEY]: 'dark' }), matchMedia: fakeMatchMedia(true) }), 'dark');
  assert.equal(resolveTheme({ storage: fakeStorage({ [THEME_KEY]: 'light' }), matchMedia: fakeMatchMedia(false) }), 'light');
});

test('resolveTheme: without a choice it follows the device, dark when unknown', () => {
  assert.equal(resolveTheme({ storage: fakeStorage(), matchMedia: fakeMatchMedia(true) }), 'light');
  assert.equal(resolveTheme({ storage: fakeStorage(), matchMedia: fakeMatchMedia(false) }), 'dark');
  assert.equal(resolveTheme({ storage: fakeStorage(), matchMedia: undefined }), 'dark');
  assert.equal(resolveTheme({ storage: fakeStorage({}, { broken: true }), matchMedia: fakeMatchMedia(true) }), 'light');
});

test('nextTheme flips and themeColor matches the token background', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(themeColor('dark'), '#0b0d10');
  assert.equal(themeColor('light'), '#f5f6f8');
  const tokens = readFileSync(new URL('../docs/css/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /:root \{[^}]*--bg: #0b0d10;/);
  assert.match(tokens, /:root\[data-theme="light"\] \{[^}]*--bg: #f5f6f8;/);
});

/** Runs the classic theme-init.js script against fake globals and returns what it set. */
function runInit({ storage, matchMedia }) {
  const meta = { content: '' };
  const root = { dataset: {} };
  const document = {
    documentElement: root,
    querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null),
  };
  const source = readFileSync(new URL('../docs/js/theme-init.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { document, localStorage: storage, matchMedia });
  return { theme: root.dataset.theme, color: meta.content };
}

test('theme-init.js resolves exactly like theme.js and sets the theme-color', () => {
  const cases = [
    { storage: fakeStorage({ [THEME_KEY]: 'light' }), matchMedia: fakeMatchMedia(false) },
    { storage: fakeStorage({ [THEME_KEY]: 'dark' }), matchMedia: fakeMatchMedia(true) },
    { storage: fakeStorage(), matchMedia: fakeMatchMedia(true) },
    { storage: fakeStorage(), matchMedia: fakeMatchMedia(false) },
    { storage: fakeStorage(), matchMedia: undefined },
    { storage: fakeStorage({ [THEME_KEY]: 'pink' }, { broken: true }), matchMedia: fakeMatchMedia(true) },
  ];
  for (const env of cases) {
    const expected = resolveTheme(env);
    assert.deepEqual(runInit(env), { theme: expected, color: themeColor(expected) });
  }
});
