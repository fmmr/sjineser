/** @typedef {{ name: string, active: boolean }} Player */

const key = (name) => name.trim().toLocaleLowerCase('nb');

/** @param {string} a @param {string} b */
export const byName = (a, b) => a.localeCompare(b, 'nb');

/**
 * @param {Player[]} players
 * @param {string} name
 * @returns {Player | null}
 */
export function findPlayer(players, name) {
  const wanted = key(name);
  return players.find((p) => key(p.name) === wanted) ?? null;
}

/**
 * Names are trimmed, non-empty, comma-free (Nights joins names with ", ") and plus-free
 * (pair links join two names with '+').
 * @returns {null | 'empty' | 'comma' | 'plus'}
 */
export function nameFormatError(raw) {
  const name = raw.trim();
  if (!name) return 'empty';
  if (name.includes(',')) return 'comma';
  if (name.includes('+')) return 'plus';
  return null;
}

/** @returns {null | 'empty' | 'comma' | 'plus' | 'duplicate'} */
export function validateNewName(raw, players) {
  return nameFormatError(raw) ?? (findPlayer(players, raw) ? 'duplicate' : null);
}

/** @param {Player[]} players */
export const activePlayers = (players) => players.filter((p) => p.active).sort((a, b) => byName(a.name, b.name));
