/**
 * JSON persistence over a localStorage-like backend.
 * @param {Pick<Storage, 'getItem' | 'setItem'>} [backend]
 */
export function createStorage(backend = globalThis.localStorage, prefix = 'sjineser:') {
  return {
    get(key, fallback) {
      const raw = backend.getItem(prefix + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      backend.setItem(prefix + key, JSON.stringify(value));
    },
  };
}
