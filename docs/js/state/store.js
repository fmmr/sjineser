import { applyOp, emptyDataset } from '../domain/dataset.js';

/**
 * Holds the last known server dataset (persisted) and exposes
 * view = server dataset + pending outbox ops, applied idempotently.
 * @param {{ storage: object, outbox: { pending(): object[] }, api: { getAll(): Promise<object> } }} deps
 */
export function createStore({ storage, outbox, api }) {
  const cached = storage.get('dataset', null);
  const listeners = new Set();
  const applyAll = (dataset, ops) => ops.reduce((ds, op) => applyOp(ds, op).dataset, dataset);

  let base = cached ?? emptyDataset();
  let loaded = cached !== null;
  let view = applyAll(base, outbox.pending());
  let tried = false;
  let fetching = null;
  let sentDuringFetch = [];

  const notify = () => listeners.forEach((listener) => listener(view));

  /**
   * Rebuilds the view. Listeners hear only about visible changes, so views are not rebuilt (and taps lost) for nothing.
   * An unchanged view keeps its identity, so caches keyed on store.get() (stats facts) stay valid.
   * @returns {boolean} whether listeners were notified
   */
  function recompute() {
    const next = applyAll(base, outbox.pending());
    if (JSON.stringify(next) === JSON.stringify(view)) return false;
    view = next;
    notify();
    return true;
  }

  function setBase(dataset) {
    base = dataset;
    storage.set('dataset', base);
  }

  async function load() {
    sentDuringFetch = [];
    const response = await api.getAll();
    if (!response.ok) return false;
    // Ops the server accepted after this request started may be missing from the response.
    setBase(applyAll(response.data, sentDuringFetch));
    const firstLoad = !loaded;
    loaded = true;
    tried = true;
    // Views showing "Laster …" must hear about the first load even if the data equals the cache.
    if (!recompute() && firstLoad) notify();
    return true;
  }

  return {
    get: () => view,
    isLoaded: () => loaded,
    /** True once the first refresh has finished, whether it succeeded or not. */
    hasTried: () => tried,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recompute,
    /** Fetches fresh server data. Concurrent calls share one request. Resolves to success. */
    refresh() {
      fetching ??= load().finally(() => {
        fetching = null;
        if (tried) return;
        // First attempt failed: views waiting on it can stop saying "Laster …".
        tried = true;
        notify();
      });
      return fetching;
    },
    /** Applies an op the server accepted, so the view does not flicker before the next refresh. */
    commit(op) {
      setBase(applyOp(base, op).dataset);
      if (fetching) sentDuringFetch.push(op);
      recompute();
    },
  };
}
