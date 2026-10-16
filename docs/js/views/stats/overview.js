import { t } from '../../i18n/nb.js';
import { overallSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { mountStatsView, renderPage, statsHeader } from './render-page.js';

/** #/stats (tab Oversikt): leaderboard, season summary, records and attendance. */
export function mountStatsOverview(root, ctx) {
  return mountStatsView(root, ctx, (page, data) => {
    page.append(statsHeader({ title: t.statsUi.title, path: '/stats', list: true }, ctx, data));
    return renderPage(page, PAGES.overview, data.facts, overallSubject(), ctx);
  });
}
