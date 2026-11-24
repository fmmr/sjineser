/** The league everyone has had so far; its data keeps the original storage names and API address. */
export const MAIN_LEAGUE = 'main';

/** A league id: lowercase letters, digits and hyphens, 3–40 characters (the server checks the same). */
const LEAGUE_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** @param {unknown} id @returns {boolean} */
export const isLeagueId = (id) => typeof id === 'string' && LEAGUE_ID.test(id);

/**
 * The league named by a page address (`?l=hp-k7x2`); null when absent or not a valid id.
 * @param {string} search `location.search`
 * @returns {string | null}
 */
export function leagueFromSearch(search) {
  const id = new URLSearchParams(search).get('l');
  return isLeagueId(id) ? id : null;
}

/**
 * What a person typed or pasted in "Legg til liga": either the whole link or just the code.
 * Case and spaces do not matter.
 * @param {string} text
 * @returns {string | null} the league id, or null when it does not look like one
 */
export function parseLeagueInput(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const fromLink = /[?&]l=([^&#\s]+)/i.exec(raw);
  const code = (fromLink ? fromLink[1] : raw).trim().toLowerCase();
  return isLeagueId(code) ? code : null;
}

/**
 * Where a league lives: the current page with `?l=` set and the hash given, `#/play` unless
 * told otherwise. The main league is `?l=main`: a bare address means "the league used last".
 * @param {{ pathname: string }} location
 * @param {string} id
 * @param {string} [hash]
 * @returns {string}
 */
export const leagueUrl = ({ pathname }, id, hash = '#/play') => `${pathname}?l=${id}${hash}`;

/**
 * Prefix of a league's own entries in localStorage (dataset, unsent changes, PIN). The main
 * league keeps the prefix it had before leagues existed, so nobody loses anything.
 * @param {string} id
 */
export const storagePrefix = (id) => (id === MAIN_LEAGUE ? 'sjineser:' : `sjineser-l-${id}:`);

/** The `?l=…` part of an absolute link into a league, empty for the main league (emails, shared links). @param {string} id */
export const leagueQuery = (id) => (id === MAIN_LEAGUE ? '' : `?l=${id}`);
