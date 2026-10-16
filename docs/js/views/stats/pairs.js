import { t } from '../../i18n/nb.js';
import { overallSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { PAIRS_PATH } from './links.js';
import { mountStatsView, renderPage, statsHeader } from './render-page.js';

/** #/stats/pairs (tab Par): every pair that played in the period. */
export function mountStatsPairs(root, ctx) {
  return mountStatsView(root, ctx, (page, data) => {
    page.append(statsHeader({ title: t.statsUi.tabs.pairs, path: PAIRS_PATH, list: true }, ctx, data));
    return renderPage(page, PAGES.pairs, data.facts, overallSubject(), ctx);
  });
}
