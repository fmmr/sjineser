import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { renderLineChart } from '../../components/chart.js';
import { chartDateFormat, chartSeries, chartYFormat } from './format.js';
import { statTile } from './tile.js';

/**
 * A line chart in a fixed-height container; y values in the value's format (rating when absent),
 * series named by name or label key. ctx.tones overrides the series colours
 * (e.g. team A / team B on the compare page).
 * @param {{ id: string }} stat
 * @param {{ series: { points: { x: string }[] }[], format?: string } | null} value
 * @param {{ tones?: string[], hideTitle?: boolean }} [ctx]
 * @returns {{ el: HTMLElement, destroy?(): void }}
 */
export function renderChart(stat, value, { tones, hideTitle } = {}) {
  if (!value) return { el: statTile(stat, null, { wide: true, hideTitle }) };
  const container = h('div', { class: 'stat-chart' });
  const formatX = chartDateFormat(value.series.flatMap((s) => s.points.map((p) => p.x)));
  const chart = renderLineChart(container, {
    series: chartSeries(value), tones, formatX, formatY: chartYFormat(value), label: t.stats[stat.id].title,
  });
  return { el: statTile(stat, container, { wide: true, hideTitle }), destroy: chart.destroy };
}
