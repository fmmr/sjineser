import { h } from '../components/dom.js';
import { formatDateLong, t } from '../../i18n/nb.js';
import { POLL_MS } from '../../config.js';
import { isISODate } from '../../domain/dates.js';
import { activeNight } from '../../domain/match.js';
import { nightFilter } from '../../domain/stats/filter.js';
import { nightSubject, overallSubject } from '../../domain/stats/subjects.js';
import { nightPlayers } from '../../domain/stats/catalog/nightsList.js';
import { PAGES } from './pages.js';
import { subjectPath } from './links.js';
import { mountStatsView, notFound, renderPage, statsHeader } from './render-page.js';

/**
 * #/stats/night/:date — one night: its sets, the night's leaderboard and winner, its pairs,
 * summary and records, all computed with the night filter. While the night is ongoing (the
 * active night) the page polls for new results like the match screen does.
 */
export function mountStatsNight(root, ctx) {
  const { store, clock } = ctx;
  const date = ctx.params.date ?? '';
  const isOngoing = () => activeNight(store.get(), clock.today(), clock.hour())?.date === date;
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && isOngoing()) store.refresh();
  }, POLL_MS);

  const view = mountStatsView(root, ctx, (page, data) => {
    const night = isISODate(date) && data.facts.nights.find((n) => n.date === date);
    if (!night) {
      page.append(...notFound(ctx));
      return undefined;
    }
    const ongoing = isOngoing();
    page.append(statsHeader({
      title: [t.nightOf(formatDateLong(date)), ongoing && h('span', { class: 'stat-marker' }, t.statsUi.setStatus.ongoing)],
      path: subjectPath(nightSubject(date)),
      season: false,
      extra: [h('p', { class: 'stats-night-players' }, t.names(nightPlayers(night)))],
    }, ctx, data));
    return renderPage(page, PAGES.night, data.facts, overallSubject(), { ...ctx, ongoing });
  }, { filter: nightFilter(isISODate(date) ? date : '') });

  if (isOngoing()) store.refresh();
  return { update: view.update, destroy: () => { clearInterval(poll); view.destroy(); } };
}
