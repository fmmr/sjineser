import { ratingOf } from './elo.js';
import { MIN_TEAM_SIZE, currentNight, matchesOfNight, playersOf, teamOf } from './match.js';
import { byName } from './players.js';
import { inSeason, seasonOf } from './season.js';

/**
 * Team sizes by number of players present: four play two against two, five three against two,
 * six three against three. With more than six, the bench rules choose six who play 3 + 3.
 * A 3-player team rotates (two play each game) and shares the result.
 */
export const TEAM_SIZES = Object.freeze({ 4: [2, 2], 5: [3, 2], 6: [3, 3] });
const MIN_PLAYERS = 2 * MIN_TEAM_SIZE;
export const MAX_PLAYING = 6;

/** @param {number} present players on the night's roster @returns {[number, number] | null} sizes of team A and B */
export const teamSizesFor = (present) => (present < MIN_PLAYERS ? null : TEAM_SIZES[Math.min(present, MAX_PLAYING)]);

/** Team rating differences are rounded down to a multiple of this, so small differences count as equal. */
export const BALANCE_TOLERANCE = 10;

/**
 * Who plays (only when more than six are present). Rules in priority order; for each player
 * a rule returns a key, lower plays first. Text for each id is in t.rules.
 */
export const BENCH_RULES = [
  { id: 'fewestTonight', key: (name, ctx) => ctx.matchesTonight(name) },
  { id: 'mostSitOutsSeason', key: (name, ctx) => -ctx.sitOutsThisSeason(name) },
  { id: 'longestSinceLastPlayed', key: (name, ctx) => ctx.lastPlayedTonight(name) },
  { id: 'alphabetical', key: (name, ctx) => ctx.alphabeticalIndex(name) },
];

/**
 * How the players are split into teams. Lower keys win, compared rule by rule. A split's
 * `pairs` are all teammate pairs within each team (one for a team of two, three for a team of three).
 */
export const SPLIT_RULES = [
  { id: 'newPartners', key: (split, ctx) => sum(split.pairs.map(ctx.partneredTonight)) },
  { id: 'balance', key: (split, ctx) => Math.floor(Math.abs(ctx.teamRating(split.A) - ctx.teamRating(split.B)) / BALANCE_TOLERANCE) },
  { id: 'seasonVariety', key: (split, ctx) => sum(split.pairs.map(ctx.partneredThisSeason)) },
];

/**
 * @typedef {{ A: string[], B: string[], bench: string[], benchRule: string | null, splitRule: string | null }} Proposal
 * benchRule/splitRule: id of the rule on which the chosen option first differs from its closest
 * competitor (the next-ranked option that is not a full tie), or null if every option ties.
 */

/**
 * Proposes teams for the next match of the current night.
 * @param {import('./match.js').Dataset} dataset
 * @param {import('./elo.js').Rated} rated
 * @returns {Proposal | null}
 */
export function proposeTeams(dataset, rated) {
  const night = currentNight(dataset);
  const sizes = night && teamSizesFor(night.players.length);
  if (!sizes) return null;
  const ctx = buildContext(withoutEmptyMatches(dataset), night, rated);

  const count = sizes[0] + sizes[1];
  const players = rank(night.players, BENCH_RULES, ctx);
  const playing = players.slice(0, count);
  const benched = players.slice(count);
  const splits = rank(splitsOf(playing.map((p) => p.item).sort(byName), sizes), SPLIT_RULES, ctx);
  const [chosen, ...others] = splits;

  return {
    A: chosen.item.A,
    B: chosen.item.B,
    bench: benched.map((p) => p.item).sort(byName),
    benchRule: benched.length ? decidingRule(BENCH_RULES, playing.at(-1), benched) : null,
    splitRule: decidingRule(SPLIT_RULES, chosen, others),
  };
}

const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);
const pairKey = (pair) => [...pair].sort(byName).join('+');
const seated = playersOf;

function compareKeys(x, y) {
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Items sorted best first by rule keys; the sort is stable, so ties keep input order. */
function rank(items, rules, ctx) {
  return items
    .map((item) => ({ item, keys: rules.map((rule) => rule.key(item, ctx)) }))
    .sort((x, y) => compareKeys(x.keys, y.keys));
}

/**
 * The rule that separated `chosen` from its closest competitor: the first of `others` (in rank
 * order) whose keys differ from `chosen` at all, compared at the first rule where they differ.
 * Null if every other option ties with `chosen`.
 */
function decidingRule(rules, chosen, others) {
  for (const other of others) {
    const index = chosen.keys.findIndex((key, i) => key !== other.keys[i]);
    if (index !== -1) return rules[index].id;
  }
  return null;
}

/** Subsets of `items` with `size` elements, in lexicographic order of positions. */
function combinations(items, size) {
  if (size === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), size - 1).map((rest) => [item, ...rest]));
}

/** All teammate pairs within a team. @param {string[]} team */
const pairsWithin = (team) => team.flatMap((name, i) => team.slice(i + 1).map((other) => [name, other]));

/**
 * Every way to split the players into team A of sizes[0] and team B of sizes[1], in a fixed
 * order: team A runs through the combinations of players in lexicographic order. With equal
 * sizes the first player is always on team A, so mirror images are not listed twice
 * (4 players: 3 splits, 5 players 3 + 2: 10, 6 players 3 + 3: 10).
 * @param {string[]} players sorted by name; teams keep this order
 * @param {[number, number]} sizes
 * @returns {{ A: string[], B: string[], pairs: [string, string][] }[]}
 */
export function splitsOf(players, [sizeA, sizeB]) {
  return combinations(players, sizeA)
    .filter((A) => sizeA !== sizeB || A[0] === players[0])
    .map((A) => {
      const B = players.filter((name) => !A.includes(name));
      return { A, B, pairs: [...pairsWithin(A), ...pairsWithin(B)] };
    });
}

/**
 * Matches without games were never played (an empty open match is replaced by the next start),
 * so they count neither as played nor as sat out.
 */
function withoutEmptyMatches(dataset) {
  const withGames = new Set(dataset.games.map((g) => g.matchId));
  return { ...dataset, matches: dataset.matches.filter((m) => withGames.has(m.matchId)) };
}

/** Times each teammate pair (any pair within a team of 2 or 3) played on the same team. */
function countPairs(matches) {
  const counts = new Map();
  for (const match of matches) {
    for (const pair of [...pairsWithin(teamOf(match, 'A')), ...pairsWithin(teamOf(match, 'B'))]) {
      counts.set(pairKey(pair), (counts.get(pairKey(pair)) ?? 0) + 1);
    }
  }
  return counts;
}

function buildContext(dataset, night, rated) {
  const tonight = matchesOfNight(dataset, night.date);
  const season = seasonOf(night.date);
  const seasonNights = dataset.nights.filter((n) => inSeason(n.date, season));
  const tonightPairs = countPairs(tonight);
  const seasonPairs = countPairs(dataset.matches.filter((m) => inSeason(m.date, season)));
  const roster = [...night.players].sort(byName);

  return {
    matchesTonight: (name) => tonight.filter((m) => seated(m).includes(name)).length,
    sitOutsThisSeason: (name) => sum(seasonNights
      .filter((n) => n.players.includes(name))
      .map((n) => matchesOfNight(dataset, n.date).filter((m) => !seated(m).includes(name)).length)),
    lastPlayedTonight: (name) => tonight.findLastIndex((m) => seated(m).includes(name)),
    alphabeticalIndex: (name) => roster.indexOf(name),
    partneredTonight: (pair) => tonightPairs.get(pairKey(pair)) ?? 0,
    partneredThisSeason: (pair) => seasonPairs.get(pairKey(pair)) ?? 0,
    teamRating: (team) => sum(team.map((name) => ratingOf(rated, name))) / team.length,
  };
}
