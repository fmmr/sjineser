import { SEATS, playersOf } from './match.js';

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

/**
 * Like validateNewName, but `to` may be another casing of the player being renamed.
 * @param {string} from the current name
 * @param {string} to
 * @param {Player[]} players
 * @returns {null | 'empty' | 'comma' | 'plus' | 'duplicate'}
 */
export function validateRename(from, to, players) {
  const formatError = nameFormatError(to);
  if (formatError) return formatError;
  const other = findPlayer(players, to);
  return other && other !== findPlayer(players, from) ? 'duplicate' : null;
}

/** @param {import('./match.js').Match} match @param {string} name */
const seated = (match, name) => name !== '' && SEATS.some((seat) => match[seat] === name);

/**
 * True if the exact name is on any night roster or in any match seat; such a player can
 * only be renamed or deactivated, never deleted.
 * @param {{ nights: { players: string[] }[], matches: object[] }} dataset
 * @param {string} name the stored name
 */
export const hasHistory = (dataset, name) =>
  dataset.nights.some((n) => n.players.includes(name)) || dataset.matches.some((m) => seated(m, name));

/**
 * @typedef {{ name: string, active: boolean, games: number, lastPlayed: string | null, deletable: boolean }} PlayerOverview
 */

/**
 * Per player: games played (all time), the date of the last night they played a game, and whether
 * they may be deleted (no history). In the order of dataset.players.
 * @param {import('./match.js').Dataset} dataset
 * @returns {PlayerOverview[]}
 */
export function playerOverview(dataset) {
  const matches = new Map(dataset.matches.map((m) => [m.matchId, m]));
  const played = new Map();
  for (const game of dataset.games) {
    const match = matches.get(game.matchId);
    if (!match) continue;
    for (const name of playersOf(match)) {
      const entry = played.get(name) ?? { games: 0, lastPlayed: null };
      entry.games += 1;
      if (!entry.lastPlayed || match.date > entry.lastPlayed) entry.lastPlayed = match.date;
      played.set(name, entry);
    }
  }
  return dataset.players.map(({ name, active }) => ({
    name,
    active,
    games: played.get(name)?.games ?? 0,
    lastPlayed: played.get(name)?.lastPlayed ?? null,
    deletable: !hasHistory(dataset, name),
  }));
}
