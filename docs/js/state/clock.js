import { isISODate, toISODate } from '../domain/dates.js';

/** Storage key of the pretend date in sandbox mode. */
export const TODAY_KEY = 'today';

/**
 * Source of "today" and the hour for the app. Real mode: the device's local date and hour.
 * Sandbox mode: a pretend date kept in storage under TODAY_KEY, with the real local hour.
 * @param {{ storage?: ReturnType<typeof import('./storage.js').createStorage> | null, now?: () => Date }} [options]
 */
export function createClock({ storage = null, now = () => new Date() } = {}) {
  return {
    /** @returns {string} YYYY-MM-DD */
    today: () => storage?.get(TODAY_KEY, null) ?? toISODate(now()),
    /** @returns {number} 0–23, the device's local hour (never pretended) */
    hour: () => now().getHours(),
    /** Stores a pretend date; ignored without storage or for anything but YYYY-MM-DD. */
    setToday: (date) => {
      if (storage && isISODate(date)) storage.set(TODAY_KEY, date);
    },
  };
}
