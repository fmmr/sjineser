import { t } from '../i18n/nb.js';
import { h } from './components/dom.js';
import { logoMark, tabIcon } from './components/icons.js';
import { askForPin } from './components/pin-prompt.js';
import { themeToggle } from './components/theme-toggle.js';

/**
 * Fills static shell text, sets up the home link, theme switch and sync badge.
 * @returns {() => void} refreshes the badge; call it on every outbox change
 */
export function mountShell({ outbox, storage }) {
  document.querySelector('[data-text="appName"]').textContent = t.appName;
  document.querySelector('.app-logo').replaceChildren(logoMark());
  // A hash-only href keeps ?sandbox, so the logo goes home in either mode.
  document.querySelector('.app-brand').setAttribute('aria-label', t.homeLink);
  document.querySelector('.app-actions').append(themeToggle());
  document.querySelectorAll('[data-tab]').forEach((link) => {
    const { tab } = link.dataset;
    link.replaceChildren(h('span', { class: 'tab-icon' }, tabIcon(tab)), h('span', {}, t.tabs[tab]));
  });

  const badge = document.getElementById('sync-badge');
  badge.addEventListener('click', () => {
    if (outbox.isHeld()) askForPin({ storage, outbox });
  });

  function update() {
    const count = outbox.pending().length;
    badge.hidden = count === 0;
    badge.textContent = outbox.isHeld() ? t.pinNeeded : t.unsynced(count);
    badge.classList.toggle('badge-warning', outbox.isHeld());
  }
  update();
  return update;
}

/** @param {string} path */
export function markActiveTab(path) {
  const active = path.startsWith('/stats') ? 'stats' : 'play';
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
