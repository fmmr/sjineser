import { h } from '../../components/dom.js';
import { formatDateLong, t } from '../../../i18n/nb.js';
import { playerSubject } from '../../../domain/stats/subjects.js';
import { statsHref, subjectPath } from '../links.js';
import { formatValue } from './format.js';
import { statTile } from './tile.js';

/** Player names as links, joined "Anne, Bjørn og Cato". */
function linkedNames(names, query) {
  return names.flatMap((name, i) => [
    t.nameSeparator(i, names.length) || null,
    h('a', { class: 'link', href: statsHref(subjectPath(playerSubject(name)), query) }, name),
  ]);
}

/**
 * The set a record is about, as a small scoreboard: one line per team with its wins, the
 * winner in bold, draws underneath. A record about a single game (no score) reads
 * "Erik og Frida slo Anne og Bjørn".
 */
function matchLine({ A, B, score }, query) {
  if (!score) return [h('p', {}, linkedNames(A, query), ` ${t.statsUi.beat} `, linkedNames(B, query))];
  const winner = score.A > score.B ? 'A' : score.B > score.A ? 'B' : null;
  const team = (side, names, wins) => h('div', { class: 'record-team', 'data-winner': String(winner === side) },
    h('span', { class: 'record-names' }, linkedNames(names, query)),
    h('span', { class: 'record-wins' }, String(wins)));
  return [
    h('div', { class: 'record-match', 'aria-label': t.statsUi.setScore(A, score.A, B, score.B) },
      team('A', A, score.A), team('B', B, score.B)),
    score.D > 0 && h('p', { class: 'muted' }, t.statsUi.draws(score.D)),
  ];
}

/** "Anne 5 · Dag 4 · Cato 2": the players a count record is mostly about, names linked. */
function rankingLine(ranking, query) {
  return h('p', { class: 'record-ranking' }, ranking.flatMap(({ name, count }, i) => [
    i > 0 && h('span', { class: 'muted', 'aria-hidden': 'true' }, ' · '),
    h('span', {},
      h('a', { class: 'link', href: statsHref(subjectPath(playerSubject(name)), query) }, name),
      ` ${count}`),
  ]));
}

/**
 * Record value, then what it is about: a ranking of players (count records), the set (both
 * teams and the score), or its holders (linked; a team of three has three); and the date it was
 * set (with the year: records span seasons).
 * @param {{ value: number, format: string, holders: string[], date?: string, match?: object,
 *   ranking?: { name: string, count: number }[] }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function recordBody({ value, format, holders, date, match, ranking }, { query }) {
  const about = ranking ? rankingLine(ranking, query)
    : match ? matchLine(match, query)
      : holders.length > 0 && h('p', {}, linkedNames(holders, query));
  return h('div', { class: 'stat-record' },
    h('p', { class: 'stat-value' }, formatValue(value, format)),
    about,
    date && h('p', { class: 'muted' }, formatDateLong(date)));
}

/** @returns {{ el: HTMLElement }} */
export const renderRecord = (stat, value, ctx) => ({ el: statTile(stat, value && recordBody(value, ctx), { hideTitle: ctx.hideTitle }) });
