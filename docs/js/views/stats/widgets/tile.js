import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { DESCRIPTION_PARAMS } from '../description-params.js';

/** @param {string} id @returns {string | null} the stat's explanation, if any */
export function describeStat(id) {
  const { description } = t.stats[id];
  return typeof description === 'function' ? description(DESCRIPTION_PARAMS) : description ?? null;
}

/**
 * The frame every widget shares: title, body (or "Ikke nok data") and the explanation.
 * @param {{ id: string }} stat
 * @param {Node | null} body null → no data
 * @param {{ wide?: boolean, hideTitle?: boolean }} [options] wide tiles span the whole grid row;
 *   hideTitle when the section heading already says it (see tileTitleHidden in pages.js)
 */
export function statTile(stat, body, { wide = false, hideTitle = false } = {}) {
  const description = describeStat(stat.id);
  return h('article', { class: wide ? 'stat-tile stat-wide' : 'stat-tile' },
    !hideTitle && h('h3', { class: 'stat-title' }, t.stats[stat.id].title),
    body ?? h('p', { class: 'muted' }, t.statsUi.noData),
    description && h('p', { class: 'stat-desc muted' }, description));
}

/** "Ny" marker for provisional ratings. */
export const provisionalMarker = () => h('span', { class: 'stat-marker' }, t.statsUi.provisional);
