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
 * The match a record is about: "Anne og Bjørn 3–1 Cato og Dag" (+ draws) for a match, or
 * "Erik og Frida slo Anne og Bjørn" for a single game (no score).
 */
function matchLine({ A, B, score }, query) {
  if (!score) return [h('p', {}, linkedNames(A, query), ` ${t.statsUi.beat} `, linkedNames(B, query))];
  return [
    h('p', { class: 'record-match' },
      h('span', { 'data-side': 'A' }, linkedNames(A, query)),
      h('span', { class: 'record-score' }, `${score.A}–${score.B}`),
      h('span', { 'data-side': 'B' }, linkedNames(B, query))),
    score.D > 0 && h('p', { class: 'muted' }, t.statsUi.draws(score.D)),
  ];
}

/**
 * Record value, then either the match it is about (both teams) or its holders (linked; a team
 * of three has three), and the date it was set (with the year: records span seasons).
 * @param {{ value: number, format: string, holders: string[], date?: string, match?: object }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function recordBody({ value, format, holders, date, match }, { query }) {
  return h('div', { class: 'stat-record' },
    h('p', { class: 'stat-value' }, formatValue(value, format)),
    match ? matchLine(match, query) : holders.length > 0 && h('p', {}, linkedNames(holders, query)),
    date && h('p', { class: 'muted' }, formatDateLong(date)));
}

/** @returns {{ el: HTMLElement }} */
export const renderRecord = (stat, value, ctx) => ({ el: statTile(stat, value && recordBody(value, ctx), { hideTitle: ctx.hideTitle }) });
