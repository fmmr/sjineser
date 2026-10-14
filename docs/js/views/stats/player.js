import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { compareSubject, playerSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { statsHref, subjectPath } from './links.js';
import { mountStatsView, notFound, renderPage, statsHeader } from './render-page.js';

/** #/stats/player/:name — the player's stats and a shortcut to compare with someone else. */
export function mountStatsPlayer(root, ctx) {
  const { name } = ctx.params;
  const subject = playerSubject(name);

  const compareWith = (others) => h('select', {
    class: 'field stats-filter',
    'aria-label': t.statsUi.compareWith,
    onchange: (event) => ctx.navigate(statsHref(subjectPath(compareSubject(name, event.target.value)), ctx.query)),
  },
  h('option', { value: '', selected: true, disabled: true }, t.statsUi.compareWith),
  others.map((other) => h('option', { value: other }, other)));

  return mountStatsView(root, ctx, (page, data) => {
    if (!data.dataset.players.some((p) => p.name === name)) {
      page.append(...notFound(ctx));
      return undefined;
    }
    const others = data.facts.players.filter((other) => other !== name);
    page.append(statsHeader({
      title: name,
      path: subjectPath(subject),
      extra: others.length > 0 ? [compareWith(others)] : [],
    }, ctx, data));
    return renderPage(page, PAGES.player, data.facts, subject, ctx);
  });
}
