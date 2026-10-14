import { applyOp } from '../domain/dataset.js';
import { findPlayer } from '../domain/players.js';
import { SANDBOX_SEED, generateHistory } from './generate.js';

const DATA_KEY = 'sandboxData';
const TODAY_KEY = 'today';

/**
 * In-browser stand-in for the Apps Script API: same interface and envelopes as api/client.js,
 * same rules via applyOp. Any PIN is accepted. Data persists in the given storage.
 * @param {{ storage: ReturnType<typeof import('../state/storage.js').createStorage>, seed?: number }} options
 */
export function createSandboxApi({ storage, seed = SANDBOX_SEED }) {
  function reset() {
    const { dataset, nextDate } = generateHistory(seed);
    storage.set(DATA_KEY, dataset);
    storage.set(TODAY_KEY, nextDate);
  }

  /** Every read parses storage afresh, so callers can never mutate the stored state. */
  function load() {
    if (storage.get(DATA_KEY, null) === null) {
      const { dataset, nextDate } = generateHistory(seed);
      storage.set(DATA_KEY, dataset);
      if (storage.get(TODAY_KEY, null) === null) storage.set(TODAY_KEY, nextDate);
    }
    return storage.get(DATA_KEY, null);
  }

  function post(action, payload) {
    const { dataset, outcome } = applyOp(load(), { action, payload });
    if (outcome === 'conflict' || outcome === 'invalid') {
      return Promise.resolve({ ok: false, error: outcome, message: outcome });
    }
    if (outcome === 'applied') storage.set(DATA_KEY, dataset);
    const response = { ok: true, result: outcome };
    // Like the server: addPlayer reports the stored spelling of the name.
    if (action === 'addPlayer') response.data = { name: findPlayer(dataset.players, payload.name).name };
    return Promise.resolve(response);
  }

  return {
    getAll: () => Promise.resolve({ ok: true, result: 'noop', data: load() }),
    post,
    reset,
  };
}
