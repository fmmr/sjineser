import { rateGames } from '../elo.js';
import { score, teamOf, winnerOf } from '../match.js';
import { byName } from '../players.js';
import { inFilter } from './filter.js';

/**
 * @typedef {'W' | 'D' | 'L'} Outcome
 * @typedef {{
 *   player: string, partners: string[], opponents: string[], side: 'A' | 'B',
 *   outcome: Outcome, matchId: string, gameNo: number, date: string,
 *   ratingBefore: number, ratingAfter: number, delta: number,
 *   teamRating: number, opponentRating: number,
 * }} PlayerGameRow partners: the player's teammates (1–2); opponents: the other team (2–3)
 * @typedef {{ matchId: string, gameNo: number, date: string, A: string[], B: string[],
 *   result: 'A' | 'B' | 'D', ratingA: number, ratingB: number }} GameFact ratingA/B: pre-game team ratings
 * @typedef {{ matchId: string, date: string, A: string[], B: string[], games: GameFact[],
 *   score: { A: number, B: number, D: number }, winner: 'A' | 'B' | null, complete: boolean }} MatchFact
 * @typedef {{ date: string, players: string[], matches: MatchFact[] }} NightFact
 * @typedef {{ filter: import('./filter.js').Filter, rows: PlayerGameRow[], games: GameFact[], matches: MatchFact[],
 *   nights: NightFact[], players: string[], rated: import('../elo.js').Rated }} Facts
 */

const OTHER_SIDE = { A: 'B', B: 'A' };

/** @param {'A' | 'B' | 'D'} result @param {'A' | 'B'} side @returns {Outcome} */
const outcomeFor = (result, side) => (result === 'D' ? 'D' : result === side ? 'W' : 'L');

/**
 * Everything stats need, computed once per dataset and filter (spec §9). Elo is replayed
 * over all games so ratings are continuous; the filter is applied afterwards.
 * Rows, games and matches are in canonical game order; matches without games are left out.
 * Teams have 2 or 3 players (spec §18): every team member gets a row for every game.
 * @param {import('../match.js').Dataset} dataset
 * @param {import('./filter.js').Filter} filter
 * @returns {Facts}
 */
export function buildFacts(dataset, filter) {
  const rated = rateGames(dataset);
  const matchById = new Map(dataset.matches.map((m) => [m.matchId, m]));
  const rows = [];
  const games = [];
  const gamesByMatch = new Map();

  for (const { game, before, changes } of rated.timeline) {
    const match = matchById.get(game.matchId);
    if (!inFilter(match.date, filter)) continue;
    const teams = { A: teamOf(match, 'A'), B: teamOf(match, 'B') };
    const teamRating = (side) => teams[side].reduce((total, name) => total + before.get(name), 0) / teams[side].length;
    const ratings = { A: teamRating('A'), B: teamRating('B') };
    const fact = {
      matchId: game.matchId, gameNo: game.gameNo, date: match.date, A: teams.A, B: teams.B,
      result: game.result, ratingA: ratings.A, ratingB: ratings.B,
    };
    games.push(fact);
    if (!gamesByMatch.has(game.matchId)) gamesByMatch.set(game.matchId, []);
    gamesByMatch.get(game.matchId).push(fact);

    for (const side of ['A', 'B']) {
      const opponents = teams[OTHER_SIDE[side]];
      for (const player of teams[side]) {
        const ratingBefore = before.get(player);
        const delta = changes.get(player);
        rows.push({
          player, partners: teams[side].filter((name) => name !== player), opponents, side,
          outcome: outcomeFor(game.result, side), matchId: game.matchId, gameNo: game.gameNo, date: match.date,
          ratingBefore, ratingAfter: ratingBefore + delta, delta,
          teamRating: ratings[side], opponentRating: ratings[OTHER_SIDE[side]],
        });
      }
    }
  }

  const matches = [...gamesByMatch].map(([matchId, matchGames]) => {
    const { date, A, B } = matchGames[0];
    const winner = winnerOf(matchGames);
    return { matchId, date, A, B, games: matchGames, score: score(matchGames), winner, complete: winner !== null };
  });
  const nights = dataset.nights
    .filter((n) => inFilter(n.date, filter))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, players }) => ({ date, players: [...players], matches: matches.filter((m) => m.date === date) }));
  const players = [...new Set(rows.map((r) => r.player))].sort(byName);

  return { filter, rows, games, matches, nights, players, rated };
}
