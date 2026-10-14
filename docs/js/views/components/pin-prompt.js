import { t } from '../../i18n/nb.js';

/** Asks for the shared PIN, stores it and resumes the held outbox. */
export function askForPin({ storage, outbox }) {
  const pin = window.prompt(t.enterPin);
  if (!pin?.trim()) return;
  storage.set('pin', pin.trim());
  outbox.resume();
}
