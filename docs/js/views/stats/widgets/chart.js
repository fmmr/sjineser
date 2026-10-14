import { h } from '../../components/dom.js';
import { formatDate } from '../../../i18n/nb.js';
import { renderLineChart } from '../../components/chart.js';
import { statTile } from './tile.js';

/**
 * A line chart in a fixed-height container. ctx.tones overrides the series colours
 * (e.g. team A / team B on the compare page).
 * @param {{ id: string }} stat
 * @param {{ series: object[] } | null} value
 * @param {{ tones?: string[] }} [ctx]
 * @returns {{ el: HTMLElement, destroy?(): void }}
 */
export function renderChart(stat, value, { tones } = {}) {
  if (!value) return { el: statTile(stat, null, { wide: true }) };
  const container = h('div', { class: 'stat-chart' });
  const chart = renderLineChart(container, { series: value.series, tones, formatX: formatDate });
  return { el: statTile(stat, container, { wide: true }), destroy: chart.destroy };
}
