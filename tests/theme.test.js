import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  THEME_CHOICES, THEME_KEY, chooseTheme, followSystemTheme, resolveTheme, storedTheme, themeChoice, themeColor,
} from '../docs/js/theme.js';

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
    removeItem(key) {
      if (broken) throw new Error('denied');
      data.delete(key);
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

test('themeColor matches the token background', () => {
  assert.equal(themeColor('dark'), '#0b0d10');
  assert.equal(themeColor('light'), '#f5f6f8');
  const tokens = readFileSync(new URL('../docs/css/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /:root \{[^}]*--bg: #0b0d10;/);
  assert.match(tokens, /:root\[data-theme="light"\] \{[^}]*--bg: #f5f6f8;/);
});

test('themeChoice: the stored theme, else system', () => {
  assert.deepEqual(THEME_CHOICES, ['system', 'dark', 'light']);
  assert.equal(themeChoice(fakeStorage({ [THEME_KEY]: 'light' })), 'light');
  assert.equal(themeChoice(fakeStorage({ [THEME_KEY]: 'dark' })), 'dark');
  assert.equal(themeChoice(fakeStorage({ [THEME_KEY]: 'pink' })), 'system');
  assert.equal(themeChoice(fakeStorage()), 'system');
  assert.equal(themeChoice(fakeStorage({}, { broken: true })), 'system');
});

test('chooseTheme: Mørk/Lys are stored and applied', () => {
  const storage = fakeStorage();
  const applied = [];
  const apply = (theme) => applied.push(theme);
  chooseTheme('light', { storage, matchMedia: fakeMatchMedia(false), apply });
  assert.equal(storage.data.get(THEME_KEY), 'light');
  chooseTheme('dark', { storage, matchMedia: fakeMatchMedia(true), apply });
  assert.equal(storage.data.get(THEME_KEY), 'dark');
  assert.deepEqual(applied, ['light', 'dark']);
});

test('chooseTheme: System forgets the stored theme and applies the device theme', () => {
  const applied = [];
  const apply = (theme) => applied.push(theme);
  const storage = fakeStorage({ [THEME_KEY]: 'dark' });
  chooseTheme('system', { storage, matchMedia: fakeMatchMedia(true), apply });
  assert.equal(storage.data.has(THEME_KEY), false);
  assert.equal(themeChoice(storage), 'system');
  chooseTheme('system', { storage: fakeStorage({ [THEME_KEY]: 'light' }), matchMedia: fakeMatchMedia(false), apply });
  chooseTheme('system', { storage: fakeStorage(), matchMedia: undefined, apply });
  assert.deepEqual(applied, ['light', 'dark', 'dark']);
});

test('chooseTheme still applies when storage fails', () => {
  const applied = [];
  const storage = fakeStorage({}, { broken: true });
  chooseTheme('light', { storage, matchMedia: fakeMatchMedia(false), apply: (theme) => applied.push(theme) });
  chooseTheme('system', { storage, matchMedia: fakeMatchMedia(true), apply: (theme) => applied.push(theme) });
  assert.deepEqual(applied, ['light', 'light']);
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

test('after each choice, theme-init.js on the next launch shows what chooseTheme applied', () => {
  for (const choice of THEME_CHOICES) {
    for (const light of [true, false, undefined]) {
      const storage = fakeStorage({ [THEME_KEY]: 'light' });
      const matchMedia = light === undefined ? undefined : fakeMatchMedia(light);
      let applied;
      chooseTheme(choice, { storage, matchMedia, apply: (theme) => { applied = theme; } });
      assert.equal(resolveTheme({ storage, matchMedia }), applied, `${choice}, light=${light}`);
      assert.deepEqual(runInit({ storage, matchMedia }), { theme: applied, color: themeColor(applied) }, `${choice}, light=${light}`);
    }
  }
});

test('after System, followSystemTheme follows the device again', () => {
  const light = { value: false };
  const media = liveMatchMedia(light);
  const storage = fakeStorage({ [THEME_KEY]: 'dark' });
  const applied = [];
  let current = 'dark';
  followSystemTheme({ matchMedia: media.matchMedia, storage, current: () => current, apply: (theme) => applied.push(theme) });
  light.value = true;
  media.fire();
  assert.deepEqual(applied, [], 'Mørk is stored');
  chooseTheme('system', { storage, matchMedia: media.matchMedia, apply: (theme) => { current = theme; } });
  assert.equal(current, 'light');
  light.value = false;
  media.fire();
  assert.deepEqual(applied, ['dark']);
});

/** matchMedia stand-in whose 'change' listeners the test can fire. */
function liveMatchMedia(light) {
  const listeners = [];
  const matchMedia = (query) => ({
    matches: query === '(prefers-color-scheme: light)' && light.value,
    addEventListener: (type, listener) => listeners.push({ query, type, listener }),
  });
  return { matchMedia, fire: () => listeners.forEach(({ listener }) => listener()), listeners };
}

test('followSystemTheme follows device changes while no explicit choice is stored', () => {
  const light = { value: false };
  const media = liveMatchMedia(light);
  const applied = [];
  let current = 'dark';
  const storage = fakeStorage();
  followSystemTheme({ matchMedia: media.matchMedia, storage, current: () => current, apply: (theme) => applied.push(theme) });
  assert.deepEqual(media.listeners.map(({ query, type }) => [query, type]), [['(prefers-color-scheme: light)', 'change']]);

  light.value = true;
  media.fire();
  assert.deepEqual(applied, ['light']);

  current = 'light';
  media.fire();
  assert.deepEqual(applied, ['light'], 'no re-apply when the theme is already right');

  storage.setItem(THEME_KEY, 'light');
  light.value = false;
  media.fire();
  assert.deepEqual(applied, ['light'], 'an explicit choice wins');
});

test('followSystemTheme without matchMedia does nothing', () => {
  assert.doesNotThrow(() => followSystemTheme({ matchMedia: undefined, storage: fakeStorage() }));
});
