import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { scoreboard } from './record.js';
import { statTile } from './tile.js';

/**
 * What an unfinished set is: the last set of an ongoing night is still being played ('ongoing');
 * any other unfinished set was abandoned or the night is over ('unfinished'). Finished → null.
 * @param {{ complete: boolean }} set
 * @param {boolean} isLast the night's latest set
 * @param {boolean} ongoing the night is still going on
 * @returns {'ongoing' | 'unfinished' | null}
 */
export function setStatus({ complete }, isLast, ongoing) {
  if (complete) return null;
  return isLast && ongoing ? 'ongoing' : 'unfinished';
}

/**
 * The night's sets in play order, each a small scoreboard like the record cards: "Sett 2", an
 * unfinished set marked "pågår" (the night is going on) or "ikke ferdig".
 * @param {{ sets: object[] }} value
 * @param {{ query: Record<string, string>, ongoing?: boolean }} ctx
 */
export function setsBody({ sets }, { query, ongoing = false }) {
  return h('ol', { class: 'set-list' }, sets.map((set, i) => {
    const status = setStatus(set, i === sets.length - 1, ongoing);
    return h('li', { class: 'set-item', 'data-status': status },
      h('p', { class: 'set-head' },
        h('span', { class: 'set-number' }, t.statsUi.setTitle(set.number)),
        status && h('span', { class: 'stat-marker' }, t.statsUi.setStatus[status])),
      scoreboard(set, query, set.winner));
  }));
}

/** @returns {{ el: HTMLElement }} */
export const renderSets = (stat, value, ctx) =>
  ({ el: statTile(stat, value && setsBody(value, ctx), { wide: true, hideTitle: ctx.hideTitle }) });
