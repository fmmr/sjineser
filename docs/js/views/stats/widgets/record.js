import { h } from '../../components/dom.js';
import { formatDate, t } from '../../../i18n/nb.js';
import { playerSubject } from '../../../domain/stats/subjects.js';
import { statsHref, subjectPath } from '../links.js';
import { formatValue } from './format.js';
import { statTile } from './tile.js';

/**
 * Record value, its holders (linked, joined with "og") and the date it was set.
 * @param {{ value: number, format: string, holders: string[], date?: string }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function recordBody({ value, format, holders, date }, { query }) {
  const names = holders.flatMap((name, i) => [
    i > 0 ? t.and : null,
    h('a', { class: 'link', href: statsHref(subjectPath(playerSubject(name)), query) }, name),
  ]);
  return h('div', { class: 'stat-record' },
    h('p', { class: 'stat-value' }, formatValue(value, format)),
    holders.length > 0 && h('p', {}, names),
    date && h('p', { class: 'muted' }, formatDate(date)));
}

/** @returns {{ el: HTMLElement }} */
export const renderRecord = (stat, value, ctx) => ({ el: statTile(stat, value && recordBody(value, ctx)) });
