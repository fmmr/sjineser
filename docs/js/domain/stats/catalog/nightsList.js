import { byName } from '../../players.js';
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
 * One summary per played night (≥ 1 set with games), newest first: everyone there (roster,
 * sitting out counts; Norwegian order), sets with games, games, draws, and the night's winner
 * (biggest total rating change; tie → name order) with that change. A night page can pick its
 * night from here by date.
 * @param {import('../facts.js').Facts} facts
 * @returns {NightSummary[]}
 */
export function nightSummaries(facts) {
  const gains = gainsByDate(facts);
  return playedNights(facts).map(({ date, players, matches }) => {
    const games = matches.flatMap((m) => m.games);
    const seated = matches.flatMap((m) => [...m.A, ...m.B]);
    const [winner, winnerGain] = [...gains.get(date)]
      .sort(([nameA, gainA], [nameB, gainB]) => gainB - gainA || byName(nameA, nameB))[0];
    return {
      date, players: [...new Set([...players, ...seated])].sort(byName), sets: matches.length, games: games.length,
      draws: games.filter((g) => g.result === 'D').length, winner, winnerGain,
    };
  }).reverse();
}

/**
 * Kvelder: the played nights in the period with a summary each, newest first. Rows have no
 * subject yet; with a night page, add one per row (its key is `date`).
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
      rows,
    };
  },
};
