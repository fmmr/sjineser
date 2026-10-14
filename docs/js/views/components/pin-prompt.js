import { pinSheet } from './sheet.js';
import { t } from '../../i18n/nb.js';

/** The sheet being shown, so repeated PIN requests share it instead of stacking sheets. */
let open = null;

/**
 * Bottom sheets need a modal <dialog> (missing on iOS before 15.4).
 * @param {{ HTMLDialogElement?: Function }} [win]
 * @returns {boolean}
 */
export function supportsSheets(win = globalThis) {
  return typeof win.HTMLDialogElement === 'function' && typeof win.HTMLDialogElement.prototype.showModal === 'function';
}

/**
 * The PIN sheet, or the browser's prompt where sheets are not supported.
 * @param {{ win?: object, prompt?: (message: string) => string | null }} [env] injectable for tests
 * @returns {() => Promise<string | null>}
 */
export function defaultAsk({ win = globalThis, prompt = globalThis.prompt } = {}) {
  return supportsSheets(win) ? pinSheet : async () => prompt(t.pin.message);
}

/**
 * Asks for the shared PIN, stores it and resumes the held outbox.
 * @param {{ storage: { set(key: string, value: any): void }, outbox: { resume(): void },
 *   ask?: () => Promise<string | null> }} options ask: shows the PIN sheet (injectable for tests)
 * @returns {Promise<void>} settles when the sheet is closed
 */
export function askForPin({ storage, outbox, ask = defaultAsk() }) {
  open ??= ask()
    .then((pin) => {
      if (!pin?.trim()) return;
      storage.set('pin', pin.trim());
      outbox.resume();
    })
    .finally(() => {
      open = null;
    });
  return open;
}
