import { attendanceStreak } from './catalog/attendanceStreak.js';
import { bestPartner } from './catalog/bestPartner.js';
import { biggestUpset } from './catalog/biggestUpset.js';
import { cleanSweeps } from './catalog/cleanSweeps.js';
import { comebacks } from './catalog/comebacks.js';
import { decisiveTable } from './catalog/decisiveTable.js';
import { decisiveWinRate } from './catalog/decisiveWinRate.js';
import { drawRate } from './catalog/drawRate.js';
import { drawRateChart } from './catalog/drawRateChart.js';
import { eloChart } from './catalog/eloChart.js';
import { favoriteVictim } from './catalog/favoriteVictim.js';
import { form } from './catalog/form.js';
import { gamesCount } from './catalog/gamesCount.js';
import { gamesPerSetChart } from './catalog/gamesPerSetChart.js';
import { gamesWdl } from './catalog/gamesWdl.js';
import { gameWinRate } from './catalog/gameWinRate.js';
import { headToHead } from './catalog/headToHead.js';
import { headToHeadMatrix } from './catalog/headToHeadMatrix.js';
import { highestRating } from './catalog/highestRating.js';
import { leaderboard } from './catalog/leaderboard.js';
import { longestDrawStreak } from './catalog/longestDrawStreak.js';
import { longestMatch } from './catalog/longestMatch.js';
import { longestNight } from './catalog/longestNight.js';
import { longestWinStreak } from './catalog/longestWinStreak.js';
import { lowestRating } from './catalog/lowestRating.js';
import { lowRating } from './catalog/lowRating.js';
import { matchesCount } from './catalog/matchesCount.js';
import { matchesWdl } from './catalog/matchesWdl.js';
import { matchWinRate } from './catalog/matchWinRate.js';
import { mostDrawsInSet } from './catalog/mostDrawsInSet.js';
import { nemesis } from './catalog/nemesis.js';
import { nightLeaderboard } from './catalog/nightLeaderboard.js';
import { nightsAttended } from './catalog/nightsAttended.js';
import { nightsCount } from './catalog/nightsCount.js';
import { nightSets } from './catalog/nightSets.js';
import { nightsList } from './catalog/nightsList.js';
import { nightWinner } from './catalog/nightWinner.js';
import { opponents } from './catalog/opponents.js';
import { pairChemistry } from './catalog/pairChemistry.js';
import { pairsTable } from './catalog/pairsTable.js';
import { pairVsPairs } from './catalog/pairVsPairs.js';
import { partners } from './catalog/partners.js';
import { peakRating } from './catalog/peakRating.js';
import { rating } from './catalog/rating.js';
import { seasonPlayers } from './catalog/seasonPlayers.js';
import { seasonTitles } from './catalog/seasonTitles.js';
import { streaks } from './catalog/streaks.js';
import { togetherWdl } from './catalog/togetherWdl.js';
import { worstPartner } from './catalog/worstPartner.js';

/**
 * The catalog of stat plugins (spec §9). Adding a stat = one file in catalog/, one import
 * and one entry here, its title under t.stats in nb.js, and its id in a page list in
 * views/stats/pages.js (compare picks up player number/wdl/chart stats by itself).
 * @typedef {import('./subjects.js').SubjectType} SubjectType
 * @typedef {import('./kinds.js').Kind} Kind
 * @typedef {{ id: string, subjects: SubjectType[], kind: Kind,
 *   compute: (facts: import('./facts.js').Facts, subject: import('./subjects.js').Subject) => object | null }} Stat
 *   compute returns a value of `kind`, or null when there is not enough data
 */

/**
 * Every stat, one per line in alphabetical order (so parallel additions rarely touch the same
 * line). The order carries no meaning: pages decide what is shown where (views/stats/pages.js).
 * @type {Stat[]}
 */
export const STATS = [
  attendanceStreak,
  bestPartner,
  biggestUpset,
  cleanSweeps,
  comebacks,
  decisiveTable,
  decisiveWinRate,
  drawRate,
  drawRateChart,
  eloChart,
  favoriteVictim,
  form,
  gamesCount,
  gamesPerSetChart,
  gamesWdl,
  gameWinRate,
  headToHead,
  headToHeadMatrix,
  highestRating,
  leaderboard,
  longestDrawStreak,
  longestMatch,
  longestNight,
  longestWinStreak,
  lowestRating,
  lowRating,
  matchesCount,
  matchesWdl,
  matchWinRate,
  mostDrawsInSet,
  nemesis,
  nightLeaderboard,
  nightsAttended,
  nightsCount,
  nightSets,
  nightsList,
  nightWinner,
  opponents,
  pairChemistry,
  pairsTable,
  pairVsPairs,
  partners,
  peakRating,
  rating,
  seasonPlayers,
  seasonTitles,
  streaks,
  togetherWdl,
  worstPartner,
];

/** @param {string} id @returns {Stat | null} */
export const statById = (id) => STATS.find((s) => s.id === id) ?? null;

/**
 * Stats that support a subject type, in catalog order.
 * @param {SubjectType} subjectType
 * @param {Kind[]} [kinds] only these kinds; all kinds when omitted
 * @param {Stat[]} [stats] the catalog to pick from (tests pass their own)
 * @returns {Stat[]}
 */
export const statsFor = (subjectType, kinds, stats = STATS) =>
  stats.filter((s) => s.subjects.includes(subjectType) && (!kinds || kinds.includes(s.kind)));
