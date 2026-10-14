import { h } from './dom.js';
import { themeIcon } from './icons.js';
import { t } from '../../i18n/nb.js';
import { currentTheme, nextTheme, setTheme } from '../../theme.js';

/**
 * Header button that switches between the dark and light theme. It is a toggle for
 * "light theme" (aria-pressed), so its name stays the same; the icon shows the current theme.
 * @returns {HTMLButtonElement}
 */
export function themeToggle() {
  const button = h('button', {
    class: 'icon-btn theme-toggle',
    type: 'button',
    'aria-label': t.theme.light,
    onclick: () => setTheme(nextTheme(currentTheme())),
  });

  function sync() {
    const theme = currentTheme();
    button.setAttribute('aria-pressed', String(theme === 'light'));
    button.replaceChildren(themeIcon(theme));
  }

  sync();
  window.addEventListener('themechange', sync);
  return button;
}
