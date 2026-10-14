import { isISODate, toISODate } from '../domain/dates.js';

/**
 * Source of "today" for the app. Real mode: the device's local date.
 * Sandbox mode: a pretend date kept in storage (key 'today').
 * @param {{ storage?: ReturnType<typeof import('./storage.js').createStorage> | null, now?: () => Date }} [options]
 */
export function createClock({ storage = null, now = () => new Date() } = {}) {
  return {
    /** @returns {string} YYYY-MM-DD */
    today: () => storage?.get('today', null) ?? toISODate(now()),
    /** Stores a pretend date; ignored without storage or for anything but YYYY-MM-DD. */
    setToday: (date) => {
      if (storage && isISODate(date)) storage.set('today', date);
    },
  };
}
