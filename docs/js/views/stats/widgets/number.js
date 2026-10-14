import { h } from '../../components/dom.js';
import { formatValue } from './format.js';
import { provisionalMarker, statTile } from './tile.js';

/**
 * A formatted number with its optional marker.
 * @param {{ value: number, format: string, marker?: string }} value
 */
export const numberBody = ({ value, format, marker }) =>
  h('p', { class: 'stat-value' }, formatValue(value, format), marker === 'provisional' && provisionalMarker());

/** @returns {{ el: HTMLElement }} */
export const renderNumber = (stat, value) => ({ el: statTile(stat, value && numberBody(value)) });
