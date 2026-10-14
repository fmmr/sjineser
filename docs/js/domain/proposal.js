import { ratingOf } from './elo.js';
import { SEATS, currentMatch, currentNight, gamesOf, matchesOfNight, teamOf } from './match.js';
import { byName } from './players.js';
import { inSeason, seasonOf } from './season.js';

const PLAYERS_PER_MATCH = 4;

/** Team rating differences within this many points count as equally balanced. */
export const BALANCE_TOLERANCE = 10;

/**
 * Who plays (only when more than four are present). Rules in priority order; for each player
 * a rule returns a key, lower plays first. Text for each id is in t.rules.
 */
export const BENCH_RULES = [
  { id: 'fewestTonight', key: (name, ctx) => ctx.matchesTonight(name) },
  { id: 'mostSitOutsSeason', key: (name, ctx) => -ctx.sitOutsThisSeason(name) },
  { id: 'longestSinceLastPlayed', key: (name, ctx) => ctx.lastPlayedTonight(name) },
  { id: 'alphabetical', key: (name, ctx) => ctx.alphabeticalIndex(name) },
];

/** How the four players are split into teams. Lower keys win, compared rule by rule. */
export const SPLIT_RULES = [
  { id: 'newPartners', key: (split, ctx) => sum(split.pairs.map(ctx.partneredTonight)) },
  { id: 'balance', key: (split, ctx) => Math.floor(Math.abs(ctx.teamRating(split.A) - ctx.teamRating(split.B)) / BALANCE_TOLERANCE) },
  { id: 'seasonVariety', key: (split, ctx) => sum(split.pairs.map(ctx.partneredThisSeason)) },
];

/**
 * @typedef {{ A: string[], B: string[], bench: string[], benchRule: string | null, splitRule: string | null }} Proposal
 * benchRule/splitRule: id of the most important rule that decided, or null if all options were equal.
 */

/**
 * Proposes teams for the next match of the current night.
 * @param {import('./match.js').Dataset} dataset
 * @param {import('./elo.js').Rated} rated
 * @returns {Proposal | null}
 */
export function proposeTeams(dataset, rated) {
  const night = currentNight(dataset);
  if (!night || night.players.length < PLAYERS_PER_MATCH) return null;
  const ctx = buildContext(withoutEmptyOpenMatch(dataset), night, rated);

  const players = rank(night.players, BENCH_RULES, ctx);
  const playing = players.slice(0, PLAYERS_PER_MATCH);
  const benched = players.slice(PLAYERS_PER_MATCH);
  const splits = rank(splitsOf(playing.map((p) => p.item).sort(byName)), SPLIT_RULES, ctx);
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
const seated = (match) => SEATS.map((seat) => match[seat]);

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

/** The most important rule on which `chosen` differs from at least one of `others`. */
function decidingRule(rules, chosen, others) {
  const indexes = others
    .map((other) => chosen.keys.findIndex((key, i) => key !== other.keys[i]))
    .filter((i) => i !== -1);
  return indexes.length ? rules[Math.min(...indexes)].id : null;
}

/** The three ways to split four players (sorted by name) into two teams. */
function splitsOf([p0, p1, p2, p3]) {
  return [[[p0, p1], [p2, p3]], [[p0, p2], [p1, p3]], [[p0, p3], [p1, p2]]]
    .map(([A, B]) => ({ A, B, pairs: [A, B] }));
}

/** An open match without games will be replaced by the next start, so it must not count. */
function withoutEmptyOpenMatch(dataset) {
  const open = currentMatch(dataset);
  if (!open || gamesOf(dataset, open.matchId).length > 0) return dataset;
  return { ...dataset, matches: dataset.matches.filter((m) => m.matchId !== open.matchId) };
}

function countPairs(matches) {
  const counts = new Map();
  for (const match of matches) {
    for (const pair of [teamOf(match, 'A'), teamOf(match, 'B')]) {
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
    teamRating: ([first, second]) => (ratingOf(rated, first) + ratingOf(rated, second)) / 2,
  };
}
