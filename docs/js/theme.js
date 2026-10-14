/**
 * Dark/light theme. The choice is System (follow the device, dark when unknown; the default),
 * Mørk or Lys. An explicit Mørk/Lys is remembered per device under one key shared by real and
 * sandbox mode; System removes it. js/theme-init.js applies the same rules before first paint;
 * keep the two in step.
 */

export const THEME_KEY = 'sjineser:theme';
const THEMES = ['dark', 'light'];
/** @typedef {'system' | 'dark' | 'light'} ThemeChoice */
/** @type {ThemeChoice[]} in the order the Mer page shows them */
export const THEME_CHOICES = ['system', ...THEMES];
const LIGHT_QUERY = '(prefers-color-scheme: light)';
/** Browser chrome colour per theme: the --bg token. */
const THEME_COLORS = { dark: '#0b0d10', light: '#f5f6f8' };

/**
 * The explicit choice, if any. Storage may be missing or throw (private mode).
 * @param {Pick<Storage, 'getItem'> | undefined} storage
 * @returns {'dark' | 'light' | null}
 */
export function storedTheme(storage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * What the device prefers, dark when unknown.
 * @param {((query: string) => { matches: boolean }) | undefined} matchMedia
 * @returns {'dark' | 'light'}
 */
const deviceTheme = (matchMedia) => (matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark');

/**
 * @param {{ storage?: Pick<Storage, 'getItem'>, matchMedia?: (query: string) => { matches: boolean } }} env
 * @returns {'dark' | 'light'}
 */
export function resolveTheme({ storage, matchMedia }) {
  return storedTheme(storage) ?? deviceTheme(matchMedia);
}

/**
 * The current choice: the stored theme, or 'system' when none is stored.
 * @param {Pick<Storage, 'getItem'> | undefined} [storage]
 * @returns {ThemeChoice}
 */
export const themeChoice = (storage = globalThis.localStorage) => storedTheme(storage) ?? 'system';

/** @param {'dark' | 'light'} theme @returns {string} */
export const themeColor = (theme) => THEME_COLORS[theme];

/** @returns {'dark' | 'light'} the applied theme */
export const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Sets the attribute and browser chrome colour, and tells the app (`themechange` on window). */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(theme));
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/**
 * Applies a choice. Mørk/Lys are remembered; System forgets the stored theme, so the device
 * decides again (now, and on later changes through followSystemTheme). Storage may fail
 * (private mode); the theme still applies for this visit.
 * @param {ThemeChoice} choice
 * @param {{ storage?: Pick<Storage, 'setItem' | 'removeItem'>, matchMedia?: (query: string) => { matches: boolean },
 *   apply?: (theme: 'dark' | 'light') => void }} [env] the browser by default (injectable for tests)
 */
export function chooseTheme(choice, {
  storage = globalThis.localStorage, matchMedia = globalThis.matchMedia, apply = applyTheme,
} = {}) {
  const system = !THEMES.includes(choice);
  try {
    if (system) storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, choice);
  } catch {
    // Not remembered, but still applied.
  }
  apply(system ? deviceTheme(matchMedia) : choice);
}

/**
 * Follows device theme changes for as long as no explicit choice is stored.
 * @param {{ matchMedia?: (query: string) => MediaQueryList, storage?: Pick<Storage, 'getItem'>,
 *   current?: () => 'dark' | 'light', apply?: (theme: 'dark' | 'light') => void }} [env]
 *   the browser by default (injectable for tests)
 */
export function followSystemTheme({
  matchMedia = globalThis.matchMedia, storage = globalThis.localStorage, current = currentTheme, apply = applyTheme,
} = {}) {
  matchMedia?.(LIGHT_QUERY).addEventListener('change', () => {
    if (storedTheme(storage)) return;
    const theme = resolveTheme({ storage, matchMedia });
    if (theme !== current()) apply(theme);
  });
}
