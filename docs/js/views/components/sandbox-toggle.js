import { h } from './dom.js';
import { sandboxIcon } from './icons.js';
import { t } from '../../i18n/nb.js';

/** URL of the current screen with test mode switched on or off (spec §17: `?sandbox`). */
export function sandboxUrl({ pathname, hash }, enable) {
  return `${pathname}${enable ? '?sandbox' : ''}${hash}`;
}

/**
 * Header button that reloads the app in or out of test mode, keeping the current screen.
 * A toggle for "test mode" (aria-pressed), next to the theme switch.
 * @param {{ sandbox: boolean }} options
 * @returns {HTMLButtonElement}
 */
export function sandboxToggle({ sandbox }) {
  return h('button', {
    class: 'icon-btn sandbox-toggle',
    type: 'button',
    'aria-label': t.sandbox.toggle,
    'aria-pressed': String(sandbox),
    onclick: () => location.assign(sandboxUrl(location, !sandbox)),
  }, sandboxIcon());
}
