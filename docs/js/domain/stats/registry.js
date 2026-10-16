import { leaderboard } from './catalog/leaderboard.js';
import { nightsCount } from './catalog/nightsCount.js';
import { matchesCount } from './catalog/matchesCount.js';
import { gamesCount } from './catalog/gamesCount.js';
import { drawRate } from './catalog/drawRate.js';
import { longestMatch } from './catalog/longestMatch.js';
import { longestNight } from './catalog/longestNight.js';
import { longestDrawStreak } from './catalog/longestDrawStreak.js';
import { cleanSweeps } from './catalog/cleanSweeps.js';
import { comebacks } from './catalog/comebacks.js';
import { biggestUpset } from './catalog/biggestUpset.js';
import { rating } from './catalog/rating.js';
import { eloChart } from './catalog/eloChart.js';
import { gamesWdl } from './catalog/gamesWdl.js';
import { gameWinRate } from './catalog/gameWinRate.js';
import { matchesWdl } from './catalog/matchesWdl.js';
import { matchWinRate } from './catalog/matchWinRate.js';
import { streaks } from './catalog/streaks.js';
import { partners } from './catalog/partners.js';
import { opponents } from './catalog/opponents.js';
import { bestPartner } from './catalog/bestPartner.js';
import { nemesis } from './catalog/nemesis.js';
import { worstPartner } from './catalog/worstPartner.js';
import { favoriteVictim } from './catalog/favoriteVictim.js';
import { pairsTable } from './catalog/pairsTable.js';
import { pairVsPairs } from './catalog/pairVsPairs.js';
import { togetherWdl } from './catalog/togetherWdl.js';
import { headToHead } from './catalog/headToHead.js';
import { attendance } from './catalog/attendance.js';
import { nightsAttended } from './catalog/nightsAttended.js';
import { pairChemistry } from './catalog/pairChemistry.js';
import { nightsList } from './catalog/nightsList.js';
import { form } from './catalog/form.js';
import { highestRating } from './catalog/highestRating.js';
import { lowestRating } from './catalog/lowestRating.js';
import { peakRating } from './catalog/peakRating.js';
import { lowRating } from './catalog/lowRating.js';
import { nightSets } from './catalog/nightSets.js';
import { nightLeaderboard } from './catalog/nightLeaderboard.js';
import { nightWinner } from './catalog/nightWinner.js';

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

/** @type {Stat[]} */
export const STATS = [
  leaderboard, nightsCount, matchesCount, gamesCount, drawRate,
  longestMatch, longestNight, longestDrawStreak, cleanSweeps, comebacks, biggestUpset, highestRating, lowestRating,
  rating, peakRating, lowRating, eloChart, gamesWdl, gameWinRate, matchesWdl, matchWinRate, streaks,
  partners, opponents, bestPartner, worstPartner, nemesis, favoriteVictim, pairsTable, pairVsPairs, togetherWdl, headToHead, attendance, nightsAttended,
  pairChemistry, nightsList, form, nightSets, nightLeaderboard, nightWinner,
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
