import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { playerSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { subjectPath } from './links.js';
import { mountStatsView, renderPage } from './render-page.js';
import { PLAYER_PATH, selectorHeader } from './selector-bar.js';

/**
 * #/stats/player/:name — the player's stats under the selector bar (player, compare, season).
 * #/stats/player — the bar alone, asking for a player.
 */
export function mountStatsPlayer(root, ctx) {
  const name = ctx.params.name ?? '';

  return mountStatsView(root, ctx, (page, data) => {
    const known = data.dataset.players.some((p) => p.name === name);
    const player = known ? name : '';
    const path = known ? subjectPath(playerSubject(name)) : PLAYER_PATH;
    page.append(selectorHeader(player || t.statsUi.title, data, { player, path }, ctx));
    if (!known) {
      page.append(h('p', { class: 'muted' }, name ? t.statsUi.notFound : t.statsUi.pickPlayer));
      return undefined;
    }
    return renderPage(page, PAGES.player, data.facts, playerSubject(name), ctx);
  });
}
