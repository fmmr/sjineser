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
  let fetching = null;
  let sentDuringFetch = [];

  function recompute() {
    view = applyAll(base, outbox.pending());
    listeners.forEach((listener) => listener(view));
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
    const fresh = applyAll(response.data, sentDuringFetch);
    const changed = !loaded || JSON.stringify(fresh) !== JSON.stringify(base);
    setBase(fresh);
    loaded = true;
    // Polling must not rebuild views (and swallow taps) when nothing changed.
    if (changed) recompute();
    return true;
  }

  return {
    get: () => view,
    isLoaded: () => loaded,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recompute,
    /** Fetches fresh server data. Concurrent calls share one request. Resolves to success. */
    refresh() {
      fetching ??= load().finally(() => {
        fetching = null;
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
