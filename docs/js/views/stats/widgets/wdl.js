import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { statTile } from './tile.js';

/** @typedef {{ W: number, D: number, L: number }} Wdl */

/**
 * Keys to show: draws are left out when there are none (match records have no draws).
 * @param {Wdl[]} values all values shown together, so side-by-side columns line up
 */
export const wdlKeys = (values) => (values.some((v) => v && v.D > 0) ? ['W', 'D', 'L'] : ['W', 'L']);

/**
 * Win/draw/loss counts and a thin stacked bar.
 * @param {Wdl} value
 * @param {('W' | 'D' | 'L')[]} [keys]
 */
export function wdlBody(value, keys = wdlKeys([value])) {
  const total = keys.reduce((sum, key) => sum + value[key], 0);
  const segment = (key) => {
    const el = h('span', { class: 'wdl-segment', 'data-outcome': key });
    el.style.setProperty('--share', String(total ? value[key] / total : 0));
    return el;
  };
  return h('div', { class: 'wdl' },
    h('dl', { class: 'wdl-counts' }, keys.map((key) =>
      h('div', { 'data-outcome': key }, h('dt', {}, t.statsColumns[key]), h('dd', {}, String(value[key]))))),
    h('div', { class: 'wdl-bar', 'aria-hidden': 'true' }, keys.map(segment)));
}

/** @returns {{ el: HTMLElement }} */
export const renderWdl = (stat, value, { hideTitle } = {}) => ({ el: statTile(stat, value && wdlBody(value), { hideTitle }) });
