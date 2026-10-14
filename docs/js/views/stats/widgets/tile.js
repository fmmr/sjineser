import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { MIN_GAMES_TOGETHER } from '../../../domain/stats/constants.js';

/** Parameters for stat descriptions that are functions. */
const DESCRIPTION_PARAMS = { minGames: MIN_GAMES_TOGETHER };

/** @param {string} id @returns {string | null} the stat's explanation, if any */
export function describeStat(id) {
  const { description } = t.stats[id];
  return typeof description === 'function' ? description(DESCRIPTION_PARAMS) : description ?? null;
}

/**
 * The frame every widget shares: title, body (or "Ikke nok data") and the explanation.
 * @param {{ id: string }} stat
 * @param {Node | null} body null → no data
 * @param {{ wide?: boolean }} [options] wide tiles span the whole grid row
 */
export function statTile(stat, body, { wide = false } = {}) {
  const description = describeStat(stat.id);
  return h('article', { class: wide ? 'stat-tile stat-wide' : 'stat-tile' },
    h('h3', { class: 'stat-title' }, t.stats[stat.id].title),
    body ?? h('p', { class: 'muted' }, t.statsUi.noData),
    description && h('p', { class: 'stat-desc muted' }, description));
}

/** "Ny" marker for provisional ratings. */
export const provisionalMarker = () => h('span', { class: 'stat-marker' }, t.statsUi.provisional);
