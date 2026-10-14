import { t } from '../i18n/nb.js';
import { h } from './components/dom.js';
import { logoMark, tabIcon } from './components/icons.js';
import { askForPin } from './components/pin-prompt.js';
import { activeTab } from '../routing.js';

/**
 * Fills static shell text, the home link, the tab bar and the sync badge. Settings live on
 * the Mer page, so the header holds only the logo and the badge.
 * @returns {() => void} refreshes the badge; call it on every outbox change
 */
export function mountShell({ outbox, storage }) {
  document.querySelector('[data-text="appName"]').textContent = t.appName;
  document.querySelector('.app-logo').replaceChildren(logoMark());
  // A hash-only href keeps ?sandbox, so the logo goes home in either mode.
  document.querySelector('.app-brand').setAttribute('aria-label', t.homeLink);
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
  const active = activeTab(path);
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
