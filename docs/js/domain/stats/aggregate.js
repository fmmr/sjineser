import { ELO } from '../elo.js';
import { byName } from '../players.js';
import { pairRows, playerRows } from './subjects.js';

/**
 * Small helpers shared by the stat plugins in catalog/. Pure; never mutate facts.
 * @typedef {import('./facts.js').Facts} Facts
 * @typedef {import('./facts.js').PlayerGameRow} PlayerGameRow
 * @typedef {import('./facts.js').MatchFact} MatchFact
 * @typedef {{ W: number, D: number, L: number }} Wdl
 */

/** @param {PlayerGameRow[]} rows @returns {Wdl} */
export function wdlOf(rows) {
  const totals = { W: 0, D: 0, L: 0 };
  for (const { outcome } of rows) totals[outcome] += 1;
  return totals;
}

/**
 * Outcomes of the last `count` rows, oldest first (rows are in canonical order).
 * @param {PlayerGameRow[]} rows @param {number} count @returns {('W' | 'D' | 'L')[]}
 */
export const lastOutcomes = (rows, count) => rows.slice(-count).map((r) => r.outcome);

/** @param {Wdl} wdl */
export const gamesOf = ({ W, D, L }) => W + D + L;

/** Wins / games (0–1); the caller makes sure there are games. @param {Wdl} wdl */
export const winRateOf = (wdl) => wdl.W / gamesOf(wdl);

/**
 * The best item; a later item wins a tie, so in canonical order ties go to the most recent.
 * @template T
 * @param {T[]} items
 * @param {(a: T, b: T) => number} compare > 0 when a is better than b
 * @returns {T | null}
 */
export function bestOf(items, compare) {
  let best = null;
  for (const item of items) if (best === null || compare(item, best) >= 0) best = item;
  return best;
}

/** The rows of a player or pair subject, from the (first) player's perspective. */
export function subjectRows(facts, subject) {
  if (subject.type === 'player') return playerRows(facts, subject.name);
  if (subject.type === 'pair') return pairRows(facts, subject.names);
  return [];
}

/** Holders of a match record: the winners (2–3), or everyone when it was not finished. @param {MatchFact} match */
export const matchHolders = (match) => (match.winner ? [...match[match.winner]] : [...match.A, ...match.B]);

/** A record's `match`: both teams and the score, so the card can say who played whom. @param {MatchFact} match */
export const recordMatch = ({ A, B, score }) => ({ A: [...A], B: [...B], score: { ...score } });

const gameKey = ({ matchId, gameNo }) => `${matchId}/${gameNo}`;

/**
 * Per player in scope: all-time games played up to and including their last game in scope.
 * The provisional marker is based on this, so an old season shows the status it had then.
 * @param {Facts} facts
 * @returns {Map<string, number>}
 */
export function gamesUpToLastInScope(facts) {
  const lastGame = new Map(facts.rows.map((r) => [r.player, gameKey(r)]));
  const counts = new Map();
  const result = new Map();
  for (const { game, before } of facts.rated.timeline) {
    const key = gameKey(game);
    for (const name of before.keys()) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (lastGame.get(name) === key) result.set(name, counts.get(name));
    }
  }
  return result;
}

/** @param {number} games all-time games played */
export const isProvisionalAfter = (games) => games < ELO.PROVISIONAL_GAMES;

/**
 * W/D/L per group, most games first (ties by key). A row can belong to several groups.
 * @param {PlayerGameRow[]} rows
 * @param {(row: PlayerGameRow) => string[]} keysOf
 * @returns {({ key: string, games: number, winRate: number } & Wdl)[]}
 */
export function wdlBy(rows, keysOf) {
  const groups = new Map();
  for (const row of rows) {
    for (const key of keysOf(row)) {
      if (!groups.has(key)) groups.set(key, { W: 0, D: 0, L: 0 });
      groups.get(key)[row.outcome] += 1;
    }
  }
  return [...groups]
    .map(([key, wdl]) => ({ key, games: gamesOf(wdl), ...wdl, winRate: winRateOf(wdl) }))
    .sort((a, b) => b.games - a.games || byName(a.key, b.key));
}

/** Columns of a W/D/L breakdown table whose first column is `key` with `format`. */
export const wdlColumns = (key, format) => [
  { key, format }, { key: 'games', format: 'int' },
  { key: 'W', format: 'int' }, { key: 'D', format: 'int' }, { key: 'L', format: 'int' },
  { key: 'winRate', format: 'percent' },
];

/** The side a player or pair played on in a match, or null. A pair counts only as a 2-player team. */
function sideOf(match, subject) {
  const has = (side) => (subject.type === 'player'
    ? match[side].includes(subject.name)
    : match[side].length === 2 && subject.names.every((name) => match[side].includes(name)));
  return has('A') ? 'A' : has('B') ? 'B' : null;
}

/**
 * Finished matches of a player, or of a pair playing as a 2-player team, won and lost.
 * Unfinished (abandoned or ongoing) matches never count.
 * @param {Facts} facts
 * @param {import('./subjects.js').Subject} subject player or pair
 * @returns {{ won: number, lost: number }}
 */
export function subjectMatches(facts, subject) {
  const totals = { won: 0, lost: 0 };
  for (const match of facts.matches) {
    const side = match.complete ? sideOf(match, subject) : null;
    if (side) totals[side === match.winner ? 'won' : 'lost'] += 1;
  }
  return totals;
}
