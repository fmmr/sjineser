import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { overallSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { PAIRS_PATH, statsHref } from './links.js';
import { mountStatsView, renderPage, statsHeader } from './render-page.js';

/** #/stats: leaderboard, season summary and records. */
export function mountStatsOverview(root, ctx) {
  return mountStatsView(root, ctx, (page, data) => {
    page.append(statsHeader({
      title: t.statsUi.title,
      path: '/stats',
      back: false,
      extra: [h('nav', { class: 'stats-links' },
        h('a', { class: 'link', href: statsHref(PAIRS_PATH, ctx.query) }, t.statsUi.pairsLink),
        h('a', { class: 'link', href: '#/about/rating' }, t.about.ratingLink))],
    }, ctx, data));
    return renderPage(page, PAGES.overview, data.facts, overallSubject(), ctx);
  });
}
