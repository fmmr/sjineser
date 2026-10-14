/** @typedef {{ date: string, players: string[] }} Night */
/** @typedef {{ matchId: string, date: string, A1: string, A2: string, B1: string, B2: string }} Match */
/** @typedef {{ matchId: string, gameNo: number, result: 'A' | 'B' | 'D', timestamp: string }} Game */
/** @typedef {{ players: import('./players.js').Player[], nights: Night[], matches: Match[], games: Game[] }} Dataset */

export const WINS_NEEDED = 3;
export const SEATS = ['A1', 'A2', 'B1', 'B2'];

/** @param {string} date @param {number} number */
export const makeMatchId = (date, number) => `${date}#${number}`;

/** @param {string} matchId */
export const isValidMatchId = (matchId) => /^\d{4}-\d{2}-\d{2}#\d+$/.test(matchId);

/** @param {string} matchId @returns {{ date: string, number: number }} */
export function parseMatchId(matchId) {
  const [date, number] = matchId.split('#');
  return { date, number: Number(number) };
}

const matchNumber = (match) => parseMatchId(match.matchId).number;

/** Canonical game order used everywhere: night date, numeric match number, game number. */
export function compareGames(a, b) {
  const x = parseMatchId(a.matchId);
  const y = parseMatchId(b.matchId);
  return x.date.localeCompare(y.date) || x.number - y.number || a.gameNo - b.gameNo;
}

/** @param {Dataset} dataset @param {string} matchId @returns {Game[]} in game order */
export const gamesOf = (dataset, matchId) =>
  dataset.games.filter((g) => g.matchId === matchId).sort((a, b) => a.gameNo - b.gameNo);

/** @param {Game[]} games */
export function score(games) {
  const totals = { A: 0, B: 0, D: 0 };
  for (const { result } of games) totals[result] += 1;
  return totals;
}

/** First team to reach WINS_NEEDED, or null. @param {Game[]} games in game order */
export function winnerOf(games) {
  const wins = { A: 0, B: 0 };
  for (const { result } of games) {
    if (result === 'D') continue;
    wins[result] += 1;
    if (wins[result] === WINS_NEEDED) return result;
  }
  return null;
}

/** @param {Game[]} games */
export const isComplete = (games) => winnerOf(games) !== null;

/** Four distinct, non-empty player names. */
export function validSeats(match) {
  const names = SEATS.map((seat) => match[seat]);
  return names.every(Boolean) && new Set(names).size === SEATS.length;
}

export const sameSeats = (a, b) => SEATS.every((seat) => a[seat] === b[seat]);

/** @param {Match} match @param {'A' | 'B'} side */
export const teamOf = (match, side) => (side === 'A' ? [match.A1, match.A2] : [match.B1, match.B2]);

/** The night with the latest date. @param {Dataset} dataset */
export const currentNight = (dataset) =>
  dataset.nights.reduce((latest, night) => (!latest || night.date > latest.date ? night : latest), null);

/** @param {Dataset} dataset @param {string} date */
export const matchesOfNight = (dataset, date) =>
  dataset.matches.filter((m) => m.date === date).sort((a, b) => matchNumber(a) - matchNumber(b));

/** Highest-numbered match of the current night. */
export function latestMatch(dataset) {
  const night = currentNight(dataset);
  return night ? (matchesOfNight(dataset, night.date).at(-1) ?? null) : null;
}

/** The latest match if it is incomplete; otherwise null. */
export function currentMatch(dataset) {
  const match = latestMatch(dataset);
  return match && !isComplete(gamesOf(dataset, match.matchId)) ? match : null;
}

/** @param {Dataset} dataset @param {string} date */
export function nextMatchId(dataset, date) {
  const last = matchesOfNight(dataset, date).at(-1);
  return makeMatchId(date, last ? matchNumber(last) + 1 : 1);
}

/** @param {Game[]} games */
export const nextGameNo = (games) => games.reduce((max, g) => Math.max(max, g.gameNo), 0) + 1;
