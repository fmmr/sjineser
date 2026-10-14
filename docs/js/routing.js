/**
 * Pure hash-route helpers: '#/stats/player/Anne?s=2026-2' ↔ path, params and query.
 * @typedef {(root: HTMLElement, ctx: object) => { update?(): void, destroy?(): void }} Mount
 * @typedef {[pattern: string, mount: Mount][]} Routes
 */

/**
 * @param {string} hash location.hash, with or without the leading '#'
 * @returns {{ path: string, query: Record<string, string> }}
 */
export function parseHash(hash) {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const at = text.indexOf('?');
  const path = at === -1 ? text : text.slice(0, at);
  const search = at === -1 ? '' : text.slice(at + 1);
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(search)) };
}

/**
 * Finds the route whose pattern matches `path`. Patterns like '/stats/player/:name';
 * params are URI-decoded ('+' stays a literal '+'). Falls back to the '/' route.
 * @param {Routes} routes
 * @param {string} path
 * @returns {{ mount: Mount, params: Record<string, string> }}
 */
export function matchRoute(routes, path) {
  const parts = path.split('/');
  for (const [pattern, mount] of routes) {
    const params = matchPattern(pattern.split('/'), parts);
    if (params) return { mount, params };
  }
  return { mount: routes.find(([pattern]) => pattern === '/')[1], params: {} };
}

/** @returns {Record<string, string> | null} null when the path does not match */
function matchPattern(pattern, parts) {
  if (pattern.length !== parts.length) return null;
  const params = {};
  for (const [i, segment] of pattern.entries()) {
    if (segment.startsWith(':')) {
      const value = decode(parts[i]);
      if (!value) return null;
      params[segment.slice(1)] = value;
    } else if (segment !== parts[i]) {
      return null;
    }
  }
  return params;
}

/** Malformed escapes count as no value. */
function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

/**
 * @param {string} path e.g. '/stats'
 * @param {Record<string, string>} [query] empty → no '?'
 * @returns {string} e.g. '#/stats?s=all'
 */
export function buildHash(path, query = {}) {
  const pairs = Object.entries(query).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length ? `#${path}?${pairs.join('&')}` : `#${path}`;
}
