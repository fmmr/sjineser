import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { renderLineChart } from '../../components/chart.js';
import { chartDateFormat, formatValue } from './format.js';
import { statTile } from './tile.js';

/** Chart values are ratings: rounded, like the rating numbers elsewhere. */
const formatY = (y) => formatValue(y, 'rating');

/**
 * A line chart in a fixed-height container. ctx.tones overrides the series colours
 * (e.g. team A / team B on the compare page).
 * @param {{ id: string }} stat
 * @param {{ series: { points: { x: string }[] }[] } | null} value
 * @param {{ tones?: string[], hideTitle?: boolean }} [ctx]
 * @returns {{ el: HTMLElement, destroy?(): void }}
 */
export function renderChart(stat, value, { tones, hideTitle } = {}) {
  if (!value) return { el: statTile(stat, null, { wide: true, hideTitle }) };
  const container = h('div', { class: 'stat-chart' });
  const formatX = chartDateFormat(value.series.flatMap((s) => s.points.map((p) => p.x)));
  const chart = renderLineChart(container, { series: value.series, tones, formatX, formatY, label: t.stats[stat.id].title });
  return { el: statTile(stat, container, { wide: true, hideTitle }), destroy: chart.destroy };
}
