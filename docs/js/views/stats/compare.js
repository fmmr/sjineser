import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { compareSubject, playerSubject } from '../../domain/stats/subjects.js';
import { COMPARE_SECTIONS, deriveCompare, overlaySeries, sideBySideRows, withValues } from './pages.js';
import { statsHref, subjectPath } from './links.js';
import { mountStatsView, notFound, statsSection } from './render-page.js';
import { selectorHeader } from './selector-bar.js';
import { renderWidget } from './widgets/index.js';
import { numberBody } from './widgets/number.js';
import { wdlBody, wdlKeys } from './widgets/wdl.js';

/**
 * #/stats/compare/:a/:b — under the selector bar (Spiller = a, Sammenlign = b), a (team A colour)
 * and b (team B colour): the player stats side by side, their charts overlaid, then the head-to-head stats.
 */
export function mountStatsCompare(root, ctx) {
  const { a, b } = ctx.params;
  const subject = compareSubject(a, b);
  const players = { a: playerSubject(a), b: playerSubject(b) };
  const { sideBySide, overlay, headToHead } = deriveCompare();

  const playerLink = (side, name) =>
    h('a', { class: 'compare-name', 'data-side': side, href: statsHref(subjectPath(playerSubject(name)), ctx.query) }, name);

  function compareRow({ stat, a: valueA, b: valueB }) {
    const keys = stat.kind === 'wdl' ? wdlKeys([valueA, valueB]) : null;
    const cell = (value, side) => h('div', { class: 'compare-cell', 'data-side': side },
      value === null ? h('p', { class: 'muted' }, t.statsUi.noData)
        : stat.kind === 'wdl' ? wdlBody(value, keys) : numberBody(value));
    return h('div', { class: 'compare-row' },
      h('h3', { class: 'stat-title' }, t.stats[stat.id].title),
      cell(valueA, 'A'),
      cell(valueB, 'B'));
  }

  return mountStatsView(root, ctx, (page, data) => {
    const known = (name) => data.dataset.players.some((p) => p.name === name);
    if (a === b || !known(a) || !known(b)) {
      page.append(...notFound(ctx));
      return undefined;
    }
    const { facts } = data;
    const destroyers = [];

    const rows = sideBySideRows(sideBySide, (stat, side) => stat.compute(facts, players[side]));
    const charts = overlay
      .map((stat) => ({ stat, merged: overlaySeries([stat.compute(facts, players.a), stat.compute(facts, players.b)]) }))
      .filter(({ merged }) => merged)
      .map(({ stat, merged }) => renderWidget(stat, merged.value, { ...ctx, tones: merged.tones }));
    destroyers.push(...charts.map((w) => w.destroy).filter(Boolean));
    const together = withValues(headToHead, facts, subject).map(({ stat, value }) => renderWidget(stat, value, ctx));

    page.append(
      selectorHeader(`${a} ${t.statsUi.versus} ${b}`, data, { player: a, other: b, path: subjectPath(subject) }, ctx),
      h('div', { class: 'stats-sections' },
        rows.length > 0 && statsSection(COMPARE_SECTIONS.sideBySide, [
          h('div', { class: 'compare-table stat-wide' },
            h('div', { class: 'compare-row compare-head' }, playerLink('A', a), playerLink('B', b)),
            rows.map(compareRow)),
        ]),
        charts.length > 0 && statsSection(COMPARE_SECTIONS.overlay, charts.map((w) => w.el), { wide: true }),
        together.length > 0 && statsSection(COMPARE_SECTIONS.headToHead, together.map((w) => w.el))));
    return { destroy: () => destroyers.forEach((destroy) => destroy()) };
  });
}
