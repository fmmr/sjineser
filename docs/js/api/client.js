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
 * @param {{ url: string, fetchFn?: typeof fetch }} options
 */
export function createApiClient({ url, fetchFn = (...args) => globalThis.fetch(...args) }) {
  async function call(init) {
    const { signal, clear } = timeoutSignal();
    try {
      const response = await fetchFn(url, { ...init, signal });
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
    post: (action, payload, pin) => call({ method: 'POST', body: JSON.stringify({ action, payload, pin }) }),
  };
}
