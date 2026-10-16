import { isISODate } from './dates.js';
import { findPlayer, hasHistory, nameFormatError } from './players.js';
import { SEATS, isValidMatchId, parseMatchId, sameSeats, validSeats } from './match.js';

/** @typedef {'applied' | 'noop' | 'conflict' | 'invalid'} Outcome */
/** @typedef {{ action: string, payload: object }} Op */

export const RESULTS = ['A', 'B', 'D'];

/** @returns {import('./match.js').Dataset} */
export const emptyDataset = () => ({ players: [], nights: [], matches: [], games: [] });

/**
 * Applies an op without mutating the input. Rules mirror apps-script/Code.js so that
 * optimistic local state matches what the sheet will contain.
 * @param {import('./match.js').Dataset} dataset
 * @param {Op} op
 * @returns {{ dataset: import('./match.js').Dataset, outcome: Outcome }}
 */
export function applyOp(dataset, op) {
  if (typeof op !== 'object' || op === null) return unchanged(dataset, 'invalid');
  const handler = Object.hasOwn(HANDLERS, op.action) ? HANDLERS[op.action] : null;
  return handler ? handler(dataset, op.payload ?? {}) : unchanged(dataset, 'invalid');
}

const unchanged = (dataset, outcome) => ({ dataset, outcome });
const changed = (dataset, patch) => ({ dataset: { ...dataset, ...patch }, outcome: 'applied' });
const sameMembers = (a, b) => a.length === b.length && a.every((name) => b.includes(name));
const isGame = (matchId, gameNo) => (g) => g.matchId === matchId && g.gameNo === gameNo;

const HANDLERS = {
  addPlayer(ds, { name }) {
    if (typeof name !== 'string' || nameFormatError(name)) return unchanged(ds, 'invalid');
    if (findPlayer(ds.players, name)) return unchanged(ds, 'noop');
    return changed(ds, { players: [...ds.players, { name: name.trim(), active: true }] });
  },

  /**
   * Renames a player everywhere: the Players row, every night roster and every match seat.
   * `to` may be another casing of the same player. A retry after success finds `from` gone
   * (or already spelled `to`) and is a noop.
   */
  renamePlayer(ds, { from, to }) {
    if (typeof from !== 'string' || typeof to !== 'string' || nameFormatError(to)) return unchanged(ds, 'invalid');
    const name = to.trim();
    const player = findPlayer(ds.players, from);
    if (!player) return unchanged(ds, findPlayer(ds.players, name) ? 'noop' : 'invalid');
    if (player.name === name) return unchanged(ds, 'noop');
    const other = findPlayer(ds.players, name);
    if (other && other !== player) return unchanged(ds, 'conflict');
    const old = player.name;
    const swap = (n) => (n === old ? name : n);
    return changed(ds, {
      players: ds.players.map((p) => (p === player ? { ...p, name } : p)),
      nights: ds.nights.map((n) => (n.players.includes(old) ? { ...n, players: n.players.map(swap) } : n)),
      matches: ds.matches.map((m) => (SEATS.some((seat) => m[seat] === old)
        ? { ...m, ...Object.fromEntries(SEATS.filter((seat) => m[seat] === old).map((seat) => [seat, name])) }
        : m)),
    });
  },

  setPlayerActive(ds, { name, active }) {
    if (typeof name !== 'string' || typeof active !== 'boolean') return unchanged(ds, 'invalid');
    const player = findPlayer(ds.players, name);
    if (!player) return unchanged(ds, 'invalid');
    if (player.active === active) return unchanged(ds, 'noop');
    return changed(ds, { players: ds.players.map((p) => (p === player ? { ...p, active } : p)) });
  },

  /** Only players without history (no roster, no seat) can be deleted; deactivate the others. */
  deletePlayer(ds, { name }) {
    if (typeof name !== 'string') return unchanged(ds, 'invalid');
    const player = findPlayer(ds.players, name);
    if (!player) return unchanged(ds, 'noop');
    if (hasHistory(ds, player.name)) return unchanged(ds, 'invalid');
    return changed(ds, { players: ds.players.filter((p) => p !== player) });
  },

  startNight(ds, { date, players }) {
    if (!Array.isArray(players)) return unchanged(ds, 'invalid');
    const existing = ds.nights.find((n) => n.date === date);
    if (existing) return unchanged(ds, sameMembers(existing.players, players) ? 'noop' : 'conflict');
    if (!isISODate(date) || players.length < 4 || new Set(players).size !== players.length) {
      return unchanged(ds, 'invalid');
    }
    return changed(ds, { nights: [...ds.nights, { date, players: [...players] }] });
  },

  /** A payload without A3 / B3 is a 2 vs 2 match; empty third seats are stored as ''. */
  startMatch(ds, { matchId, date, A1, A2, A3 = '', B1, B2, B3 = '' }) {
    const match = { matchId, date, A1, A2, A3: A3 ?? '', B1, B2, B3: B3 ?? '' };
    const existing = ds.matches.find((m) => m.matchId === matchId);
    if (existing) return unchanged(ds, sameSeats(existing, match) ? 'noop' : 'conflict');
    if (typeof matchId !== 'string' || !isValidMatchId(matchId) || date !== parseMatchId(matchId).date || !validSeats(match)) {
      return unchanged(ds, 'invalid');
    }
    return changed(ds, { matches: [...ds.matches, match] });
  },

  addGame(ds, { matchId, gameNo, result, timestamp }) {
    if (typeof matchId !== 'string' || !Number.isInteger(gameNo) || gameNo < 1 || !RESULTS.includes(result)
      || !ds.matches.some((m) => m.matchId === matchId)) {
      return unchanged(ds, 'invalid');
    }
    const existing = ds.games.find(isGame(matchId, gameNo));
    if (existing) return unchanged(ds, existing.result === result ? 'noop' : 'conflict');
    return changed(ds, { games: [...ds.games, { matchId, gameNo, result, timestamp }] });
  },

  deleteGame(ds, { matchId, gameNo }) {
    if (typeof matchId !== 'string') return unchanged(ds, 'noop');
    const matches = isGame(matchId, gameNo);
    if (!ds.games.some(matches)) return unchanged(ds, 'noop');
    return changed(ds, { games: ds.games.filter((g) => !matches(g)) });
  },

  deleteMatch(ds, { matchId }) {
    if (typeof matchId !== 'string') return unchanged(ds, 'noop');
    if (!ds.matches.some((m) => m.matchId === matchId)) return unchanged(ds, 'noop');
    if (ds.games.some((g) => g.matchId === matchId)) return unchanged(ds, 'invalid');
    return changed(ds, { matches: ds.matches.filter((m) => m.matchId !== matchId) });
  },
};
