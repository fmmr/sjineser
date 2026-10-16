import { h } from '../components/dom.js';
import { statsSkeleton } from '../components/skeleton.js';
import { t } from '../../i18n/nb.js';
import { statById } from '../../domain/stats/registry.js';
import { parseFilter } from '../../domain/stats/filter.js';
import { factsFor } from './facts-cache.js';
import { seasonFilter } from './season-filter.js';
import { statsHref } from './links.js';
import { tileTitleHidden, withValues } from './pages.js';
import { WIDE_KINDS, renderWidget } from './widgets/index.js';

/**
 * A titled section of widgets in an auto-fit grid. Sections holding a table or chart are
 * wide: on wide screens they span both columns.
 * @param {string} id heading key in t.statsSections
 * @param {Node[]} children
 * @param {{ wide?: boolean }} [options]
 */
export const statsSection = (id, children, { wide = false } = {}) =>
  h('section', { class: wide ? 'stats-section stats-section-wide' : 'stats-section' },
    h('h2', {}, t.statsSections[id]),
    h('div', { class: 'stat-grid' }, children));

/**
 * Renders a page definition (pages.js) for one subject into `root`. Stats without data are left
 * out, and so are sections with none left; a page with nothing at all says "Ikke nok data".
 * @param {HTMLElement} root
 * @param {{ sections: { id: string, stats: string[] }[] }} page
 * @param {import('../../domain/stats/facts.js').Facts} facts
 * @param {import('../../domain/stats/subjects.js').Subject} subject
 * @param {{ query: Record<string, string> }} ctx
 * @returns {{ destroy(): void }} destroys the charts
 */
export function renderPage(root, page, facts, subject, ctx) {
  const destroyers = [];
  const sections = page.sections.map((section) => {
    const shown = withValues(section.stats.map(statById), facts, subject);
    if (shown.length === 0) return null;
    const tileCtx = { ...ctx, hideTitle: tileTitleHidden(section) };
    const widgets = shown.map(({ stat, value }) => renderWidget(stat, value, tileCtx));
    destroyers.push(...widgets.map((w) => w.destroy).filter(Boolean));
    return statsSection(section.id, widgets.map((w) => w.el), { wide: shown.some(({ stat }) => WIDE_KINDS.includes(stat.kind)) });
  }).filter(Boolean);
  root.append(sections.length > 0
    ? h('div', { class: 'stats-sections' }, sections)
    : h('p', { class: 'muted' }, t.statsUi.noData));
  return { destroy: () => destroyers.forEach((destroy) => destroy()) };
}

/**
 * Page heading with the season filter, plus an optional back link and extra content.
 * @param {{ title: Node | string, path: string, back?: boolean, extra?: Node[] }} options path: this page, for the filter
 * @param {{ query: Record<string, string>, navigate: (path: string) => void }} ctx
 * @param {{ dataset: object, filter: object, today: string }} data
 */
export function statsHeader({ title, path, back = true, extra = [] }, { query, navigate }, { dataset, filter, today }) {
  return h('header', { class: 'stats-header' },
    back && h('a', { class: 'link stats-back', href: statsHref('/stats', query) }, t.statsUi.back),
    h('div', { class: 'stats-title-row' },
      h('h1', {}, title),
      seasonFilter({ dataset, filter, today, path, query, navigate })),
    extra);
}

/** Muted "not found" text for unknown players or pairs. */
export const notFound = (ctx) => [
  h('a', { class: 'link stats-back', href: statsHref('/stats', ctx.query) }, t.statsUi.back),
  h('p', { class: 'muted' }, t.statsUi.notFound),
];

/**
 * Shared frame of the stats views: loading placeholder, filter from ?s (without it: all
 * seasons), memoized facts, and re-rendering on store changes.
 * @param {HTMLElement} root
 * @param {{ store: object, clock: { today(): string }, query: Record<string, string> }} ctx
 * @param {(page: HTMLElement, data: { dataset: object, facts: object, filter: object, today: string })
 *   => ({ destroy?(): void } | void)} render
 * @returns {{ update(): void, destroy(): void }}
 */
export function mountStatsView(root, ctx, render) {
  const { store, clock, query } = ctx;
  let cleanup = null;

  function update() {
    cleanup?.();
    cleanup = null;
    if (!store.isLoaded() && !store.hasTried()) {
      root.replaceChildren(statsSkeleton());
      return;
    }
    const page = h('div', { class: 'stats-page' });
    root.replaceChildren(page);
    const dataset = store.get();
    const today = clock.today();
    const filter = query.s ? parseFilter(query.s, today) : { kind: 'all' };
    cleanup = render(page, { dataset, facts: factsFor(dataset, filter), filter, today })?.destroy ?? null;
  }

  update();
  return { update, destroy: () => cleanup?.() };
}
