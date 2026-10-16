import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { buildHash } from '../../routing.js';
import { formatFilter, seasonsIn } from '../../domain/stats/filter.js';

/**
 * Choices for the season filter: every season with nights plus the current one, in
 * chronological order and by name ("Vår 2026", "Høst 2026"), then all seasons.
 * @param {import('../../domain/match.js').Dataset} dataset
 * @param {string} today YYYY-MM-DD
 * @returns {{ value: string, label: string }[]} value: the URL form ('2026-2' / 'all')
 */
export function seasonOptions(dataset, today) {
  const seasons = seasonsIn(dataset, today).reverse()
    .map((season) => ({ value: formatFilter(season), label: t.statsUi.season(season) }));
  return [...seasons, { value: 'all', label: t.statsUi.allSeasons }];
}

/**
 * The season options with the filter's own season added (before "Alle") when it has no nights.
 * @param {import('../../domain/match.js').Dataset} dataset
 * @param {import('../../domain/stats/filter.js').Filter} filter
 * @param {string} today YYYY-MM-DD
 * @returns {{ options: { value: string, label: string }[], selected: string }}
 */
export function seasonChoices(dataset, filter, today) {
  const selected = formatFilter(filter);
  const options = seasonOptions(dataset, today);
  if (!options.some((o) => o.value === selected)) options.splice(-1, 0, { value: selected, label: t.statsUi.season(filter) });
  return { options, selected };
}

/**
 * Season select; choosing navigates to the same page with ?s=<season>.
 * @param {{ dataset: object, filter: import('../../domain/stats/filter.js').Filter, today: string,
 *   path: string, query: Record<string, string>, navigate: (path: string) => void }} options
 */
export function seasonFilter({ dataset, filter, today, path, query, navigate }) {
  const { options, selected } = seasonChoices(dataset, filter, today);
  return h('select', {
    class: 'field stats-filter',
    'aria-label': t.statsUi.seasonLabel,
    onchange: (event) => navigate(buildHash(path, { ...query, s: event.target.value })),
  }, options.map(({ value, label }) => h('option', { value, selected: value === selected }, label)));
}
