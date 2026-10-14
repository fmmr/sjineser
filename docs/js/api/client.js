const NETWORK_ERROR = Object.freeze({ ok: false, error: 'network', message: 'Network error' });

/**
 * The only module that talks to the backend. Every call resolves to an envelope:
 * { ok: true, result?, data? } or { ok: false, error, message }.
 * @param {{ url: string, fetchFn?: typeof fetch }} options
 */
export function createApiClient({ url, fetchFn = (...args) => globalThis.fetch(...args) }) {
  async function call(init) {
    try {
      const response = await fetchFn(url, init);
      const body = await response.json();
      return typeof body?.ok === 'boolean' ? body : NETWORK_ERROR;
    } catch {
      return NETWORK_ERROR;
    }
  }

  return {
    getAll: () => call({ method: 'GET', cache: 'no-store' }),
    // No custom headers: a string body goes out as text/plain, keeping this a CORS simple request.
    post: (action, payload, pin) => call({ method: 'POST', body: JSON.stringify({ action, payload, pin }) }),
  };
}
