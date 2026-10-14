import { t } from '../i18n/nb.js';
import { askForPin } from './components/pin-prompt.js';

/**
 * Fills static shell text and sets up the sync badge.
 * @returns {() => void} refreshes the badge; call it on every outbox change
 */
export function mountShell({ outbox, storage }) {
  document.querySelector('[data-text="appName"]').textContent = t.appName;
  document.querySelectorAll('[data-tab]').forEach((link) => {
    link.textContent = t.tabs[link.dataset.tab];
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
