import { MAIN_LEAGUE } from '../leagues.js';

// A timed-out request aborts and is reported as a network error, so the outbox retries it.
const TIMEOUT_MS = 15000;
const NETWORK_ERROR = Object.freeze({ ok: false, error: 'network', message: 'Network error' });

/** An AbortSignal that fires after TIMEOUT_MS, plus a cleanup to call once the request settles. */
function timeoutSignal() {
  if (typeof AbortSignal.timeout === 'function') return { signal: AbortSignal.timeout(TIMEOUT_MS), clear: () => {} };
  // Older Safari lacks AbortSignal.timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * The only module that talks to the backend. Every call resolves to an envelope:
 * { ok: true, result?, data? } or { ok: false, error, message }.
 * `league` picks which league's sheet the server uses; none (or the main league) sends no league at
 * all, so requests of the main league are exactly what they were before leagues existed.
 * @param {{ url: string, league?: string, fetchFn?: typeof fetch }} options
 */
export function createApiClient({ url, league = MAIN_LEAGUE, fetchFn = (...args) => globalThis.fetch(...args) }) {
  const other = league !== MAIN_LEAGUE ? league : null;
  const readUrl = other ? `${url}?l=${encodeURIComponent(other)}` : url;
  async function call(init) {
    const { signal, clear } = timeoutSignal();
    try {
      const response = await fetchFn(init.method === 'GET' ? readUrl : url, { ...init, signal });
      const body = await response.json();
      return typeof body?.ok === 'boolean' ? body : NETWORK_ERROR;
    } catch {
      return NETWORK_ERROR;
    } finally {
      clear();
    }
  }

  return {
    getAll: () => call({ method: 'GET', cache: 'no-store' }),
    // No custom headers: a string body goes out as text/plain, keeping this a CORS simple request.
    post: (action, payload, pin) =>
      call({ method: 'POST', body: JSON.stringify({ action, payload, pin, ...(other ? { league: other } : {}) }) }),
  };
}
