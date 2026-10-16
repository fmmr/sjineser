import { t } from '../../i18n/nb.js';
import { overallSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { NIGHTS_PATH } from './links.js';
import { mountStatsView, renderPage, statsHeader } from './render-page.js';

/** #/stats/nights (tab Kvelder): the nights of the period; a row opens the night page. */
export function mountStatsNights(root, ctx) {
  return mountStatsView(root, ctx, (page, data) => {
    page.append(statsHeader({ title: t.statsUi.tabs.nights, path: NIGHTS_PATH, list: true }, ctx, data));
    return renderPage(page, PAGES.nights, data.facts, overallSubject(), ctx);
  });
}
