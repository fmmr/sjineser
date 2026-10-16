import { byName } from '../../players.js';
import { nightSubject } from '../subjects.js';
import { playedNights } from './attendance.js';

/**
 * @typedef {{ date: string, players: string[], sets: number, games: number, draws: number,
 *   winner: string, winnerGain: number }} NightSummary
 */

/** Total rating change per player per date. @param {import('../facts.js').Facts} facts @returns {Map<string, Map<string, number>>} */
function gainsByDate(facts) {
  const gains = new Map();
  for (const { date, player, delta } of facts.rows) {
    if (!gains.has(date)) gains.set(date, new Map());
    const night = gains.get(date);
    night.set(player, (night.get(player) ?? 0) + delta);
  }
  return gains;
}

/**
 * Everyone who was at a night: the roster (sitting out counts) plus anyone seated in its sets,
 * Norwegian order. @param {import('../facts.js').NightFact} night @returns {string[]}
 */
export const nightPlayers = ({ players, matches }) =>
  [...new Set([...players, ...matches.flatMap((m) => [...m.A, ...m.B])])].sort(byName);

/**
 * One summary per played night (≥ 1 set with games), newest first: everyone there (roster,
 * sitting out counts; Norwegian order), sets with games, games, draws, and the night's winner
 * (biggest total rating change; tie → name order) with that change.
 * @param {import('../facts.js').Facts} facts
 * @returns {NightSummary[]}
 */
export function nightSummaries(facts) {
  const gains = gainsByDate(facts);
  return playedNights(facts).map((night) => {
    const { date, matches } = night;
    const games = matches.flatMap((m) => m.games);
    const [winner, winnerGain] = [...gains.get(date)]
      .sort(([nameA, gainA], [nameB, gainB]) => gainB - gainA || byName(nameA, nameB))[0];
    return {
      date, players: nightPlayers(night), sets: matches.length, games: games.length,
      draws: games.filter((g) => g.result === 'D').length, winner, winnerGain,
    };
  }).reverse();
}

/**
 * Kvelder: the played nights in the period with a summary each, newest first. Each row links
 * to its night page (the date cell).
 * @type {import('../registry.js').Stat}
 */
export const nightsList = {
  id: 'nightsList',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const rows = nightSummaries(facts);
    if (rows.length === 0) return null;
    return {
      columns: [
        { key: 'date', format: 'date' }, { key: 'players', format: 'players' }, { key: 'sets', format: 'int' },
        { key: 'games', format: 'int' }, { key: 'draws', format: 'int' }, { key: 'winner', format: 'player' },
        { key: 'winnerGain', format: 'signed' },
      ],
      rows: rows.map((row) => ({ ...row, subject: nightSubject(row.date) })),
    };
  },
};
