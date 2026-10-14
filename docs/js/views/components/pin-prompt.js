import { pinSheet } from './sheet.js';

/** The sheet being shown, so repeated PIN requests share it instead of stacking sheets. */
let open = null;

/**
 * Asks for the shared PIN, stores it and resumes the held outbox.
 * @param {{ storage: { set(key: string, value: any): void }, outbox: { resume(): void },
 *   ask?: () => Promise<string | null> }} options ask: shows the PIN sheet (injectable for tests)
 * @returns {Promise<void>} settles when the sheet is closed
 */
export function askForPin({ storage, outbox, ask = pinSheet }) {
  open ??= ask().then((pin) => {
    open = null;
    if (!pin?.trim()) return;
    storage.set('pin', pin.trim());
    outbox.resume();
  });
  return open;
}
