import { STATS, statsFor } from '../../domain/stats/registry.js';
import { t } from '../../i18n/nb.js';

/**
 * Stats pages as lists of stat ids (spec §9). Moving a stat between pages = editing a list.
 * @typedef {import('../../domain/stats/registry.js').Stat} Stat
 * @typedef {{ id: string, stats: string[] }} Section id: heading key in t.statsSections
 */

/** @type {Record<string, { sections: Section[] }>} */
export const PAGES = {
  overview: { sections: [
    { id: 'leaderboard', stats: ['leaderboard'] },
    { id: 'summary', stats: ['nightsCount', 'matchesCount', 'gamesCount', 'drawRate'] },
    { id: 'records', stats: ['longestMatch', 'longestDrawStreak', 'cleanSweeps', 'comebacks', 'biggestUpset'] },
    { id: 'nights', stats: ['nightsList'] },
    { id: 'attendance', stats: ['attendance'] },
  ] },
  player: { sections: [
    { id: 'rating', stats: ['rating', 'eloChart'] },
    { id: 'form', stats: ['form'] },
    { id: 'results', stats: ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate', 'nightsAttended'] },
    { id: 'streaks', stats: ['streaks'] },
    { id: 'people', stats: ['bestPartner', 'nemesis', 'partners', 'opponents'] },
  ] },
  pairs: { sections: [
    { id: 'chemistry', stats: ['chemistry'] },
    { id: 'pairs', stats: ['pairsTable'] },
  ] },
  pair: { sections: [
    { id: 'results', stats: ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate'] },
    { id: 'versus', stats: ['pairVsPairs'] },
  ] },
};

/** The subject type each page computes its stats for. */
export const PAGE_SUBJECTS = { overview: 'overall', player: 'player', pairs: 'overall', pair: 'pair' };

/** Section headings (t.statsSections keys) of the derived compare page. */
export const COMPARE_SECTIONS = { sideBySide: 'sideBySide', overlay: 'overlay', headToHead: 'headToHead' };

/**
 * Compare is derived, not listed: every number/wdl stat supporting 'player' side by side,
 * every chart stat supporting 'player' overlaid, then all stats with subject 'compare'.
 * @param {Stat[]} [stats]
 * @returns {{ sideBySide: Stat[], overlay: Stat[], headToHead: Stat[] }}
 */
export const deriveCompare = (stats = STATS) => ({
  sideBySide: statsFor('player', ['number', 'wdl'], stats),
  overlay: statsFor('player', ['chart'], stats),
  headToHead: statsFor('compare', undefined, stats),
});

/**
 * Whether a section's tile drops its title: a lone stat titled like the section heading
 * would otherwise say the same thing twice. The section heading always stays.
 * @param {Section} section
 */
export const tileTitleHidden = ({ id, stats }) =>
  stats.length === 1 && t.stats[stats[0]]?.title === t.statsSections[id];

/**
 * One row per stat with both players' values; stats with no data on either side are left out.
 * @param {Stat[]} stats
 * @param {(stat: Stat, side: 'a' | 'b') => object | null} valueOf
 * @returns {{ stat: Stat, a: object | null, b: object | null }[]}
 */
export const sideBySideRows = (stats, valueOf) => stats
  .map((stat) => ({ stat, a: valueOf(stat, 'a'), b: valueOf(stat, 'b') }))
  .filter(({ a, b }) => a !== null || b !== null);

const SIDE_TONES = ['team-a', 'team-b'];

/**
 * Both players' chart values as one chart: a in team A colour, b in team B colour.
 * @param {[object | null, object | null]} values chart values of a and b
 * @returns {{ value: { series: object[] }, tones: string[] } | null} null when neither has data
 */
export function overlaySeries(values) {
  const present = values.map((value, i) => ({ value, tone: SIDE_TONES[i] })).filter(({ value }) => value);
  if (present.length === 0) return null;
  return {
    value: { series: present.flatMap(({ value }) => value.series) },
    tones: present.flatMap(({ value, tone }) => value.series.map(() => tone)),
  };
}

/**
 * The page's stats that have a value for the subject, in page order. Stats without enough data
 * (compute → null) are left out instead of showing "Ikke nok data".
 * @param {import('../../domain/stats/registry.js').Stat[]} stats
 * @returns {{ stat: import('../../domain/stats/registry.js').Stat, value: object }[]}
 */
export const withValues = (stats, facts, subject) => stats
  .map((stat) => ({ stat, value: stat.compute(facts, subject) }))
  .filter(({ value }) => value !== null);
