/**
 * Dark/light theme. The first visit follows the device (dark when unknown); an explicit
 * choice is remembered per device under one key shared by real and sandbox mode.
 * js/theme-init.js applies the same rules before first paint; keep the two in step.
 */

export const THEME_KEY = 'sjineser:theme';
const THEMES = ['dark', 'light'];
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
 * @param {{ storage?: Pick<Storage, 'getItem'>, matchMedia?: (query: string) => { matches: boolean } }} env
 * @returns {'dark' | 'light'}
 */
export function resolveTheme({ storage, matchMedia }) {
  return storedTheme(storage) ?? (matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark');
}

/** @param {'dark' | 'light'} theme */
export const nextTheme = (theme) => (theme === 'light' ? 'dark' : 'light');

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
 * Applies and remembers an explicit choice. Storing may fail (private mode); the theme
 * still applies for this visit.
 * @param {'dark' | 'light'} theme
 */
export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered, but still applied.
  }
  applyTheme(theme);
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
