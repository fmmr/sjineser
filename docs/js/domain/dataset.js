import { isISODate } from './dates.js';
import { findPlayer, nameFormatError } from './players.js';
import { isValidMatchId, parseMatchId, sameSeats, validSeats } from './match.js';

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

  startNight(ds, { date, players }) {
    if (!Array.isArray(players)) return unchanged(ds, 'invalid');
    const existing = ds.nights.find((n) => n.date === date);
    if (existing) return unchanged(ds, sameMembers(existing.players, players) ? 'noop' : 'conflict');
    if (!isISODate(date) || players.length < 4 || new Set(players).size !== players.length) {
      return unchanged(ds, 'invalid');
    }
    return changed(ds, { nights: [...ds.nights, { date, players: [...players] }] });
  },

  startMatch(ds, { matchId, date, A1, A2, B1, B2 }) {
    const match = { matchId, date, A1, A2, B1, B2 };
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
