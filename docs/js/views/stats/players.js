import { t } from '../../i18n/nb.js';
import { overallSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { PLAYERS_PATH } from './links.js';
import { mountStatsView, renderPage, statsHeader } from './render-page.js';

/** #/stats/players (tab Spillere): everyone who has played; a row opens the player page. */
export function mountStatsPlayers(root, ctx) {
  return mountStatsView(root, ctx, (page, data) => {
    page.append(statsHeader({ title: t.statsUi.tabs.players, path: PLAYERS_PATH, list: true }, ctx, data));
    return renderPage(page, PAGES.players, data.facts, overallSubject(), ctx);
  });
}
