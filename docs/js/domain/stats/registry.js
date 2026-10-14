import { leaderboard } from './catalog/leaderboard.js';
import { nightsCount } from './catalog/nightsCount.js';
import { matchesCount } from './catalog/matchesCount.js';
import { gamesCount } from './catalog/gamesCount.js';
import { drawRate } from './catalog/drawRate.js';
import { longestMatch } from './catalog/longestMatch.js';
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
import { pairsTable } from './catalog/pairsTable.js';
import { pairVsPairs } from './catalog/pairVsPairs.js';
import { togetherWdl } from './catalog/togetherWdl.js';
import { againstWdl } from './catalog/againstWdl.js';

/**
 * The catalog of stat plugins (spec §9). Adding a stat = one file in catalog/, one import
 * and one entry here, and its title under t.stats in nb.js.
 * @typedef {import('./subjects.js').SubjectType} SubjectType
 * @typedef {import('./kinds.js').Kind} Kind
 * @typedef {{ id: string, subjects: SubjectType[], kind: Kind,
 *   compute: (facts: import('./facts.js').Facts, subject: import('./subjects.js').Subject) => object | null }} Stat
 *   compute returns a value of `kind`, or null when there is not enough data
 */

/** @type {Stat[]} */
export const STATS = [
  leaderboard, nightsCount, matchesCount, gamesCount, drawRate,
  longestMatch, longestDrawStreak, cleanSweeps, comebacks, biggestUpset,
  rating, eloChart, gamesWdl, gameWinRate, matchesWdl, matchWinRate, streaks,
  partners, opponents, bestPartner, nemesis, pairsTable, pairVsPairs, togetherWdl, againstWdl,
];

/** @param {string} id @returns {Stat | null} */
export const statById = (id) => STATS.find((s) => s.id === id) ?? null;

/**
 * Registered stats that support a subject type, in catalog order.
 * @param {SubjectType} subjectType
 * @param {Kind[]} [kinds] only these kinds; all kinds when omitted
 * @returns {Stat[]}
 */
export const statsFor = (subjectType, kinds) =>
  STATS.filter((s) => s.subjects.includes(subjectType) && (!kinds || kinds.includes(s.kind)));
