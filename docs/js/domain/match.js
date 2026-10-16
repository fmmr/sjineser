/** @typedef {{ date: string, players: string[] }} Night */
/**
 * A team has 2 or 3 players. A3 / B3 are '' (or absent in older data) for a 2-player team.
 * @typedef {{ matchId: string, date: string, A1: string, A2: string, A3?: string, B1: string, B2: string, B3?: string }} Match
 */
/** @typedef {{ matchId: string, gameNo: number, result: 'A' | 'B' | 'D', timestamp: string }} Game */
/** @typedef {{ players: import('./players.js').Player[], nights: Night[], matches: Match[], games: Game[] }} Dataset */

export const WINS_NEEDED = 3;
export const SEATS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
/** Seats per side; the first two are required, the third is optional. */
export const TEAM_SEATS = { A: ['A1', 'A2', 'A3'], B: ['B1', 'B2', 'B3'] };
export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 3;

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

/** A seat's name, '' when empty or absent. */
const seatName = (match, seat) => match[seat] ?? '';

/**
 * Each team has 2–3 distinct non-empty names (seats 1 and 2 filled, seat 3 optional) and no
 * player is on both teams.
 */
export function validSeats(match) {
  const names = [];
  for (const seats of Object.values(TEAM_SEATS)) {
    const team = seats.map((seat) => seatName(match, seat));
    if (!team.every((name) => typeof name === 'string')) return false;
    if (!team.slice(0, MIN_TEAM_SIZE).every(Boolean)) return false;
    names.push(...team.filter(Boolean));
  }
  return new Set(names).size === names.length;
}

/** Same players in the same seats; a missing third seat equals an empty one. */
export const sameSeats = (a, b) => SEATS.every((seat) => seatName(a, seat) === seatName(b, seat));

/** The players of one side: only filled seats. @param {Match} match @param {'A' | 'B'} side @returns {string[]} */
export const teamOf = (match, side) => TEAM_SEATS[side].map((seat) => seatName(match, seat)).filter(Boolean);

/** All players of a match, team A first. @param {Match} match @returns {string[]} */
export const playersOf = (match) => [...teamOf(match, 'A'), ...teamOf(match, 'B')];

/**
 * All six seats from two teams of 2–3 players ('' for an empty third seat).
 * @param {string[]} A @param {string[]} B
 */
export const seatsOf = (A, B) => Object.fromEntries(
  Object.entries({ A, B }).flatMap(([side, team]) => TEAM_SEATS[side].map((seat, i) => [seat, team[i] ?? ''])),
);

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
