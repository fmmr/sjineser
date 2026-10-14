import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { compareSubject, pairSubject, parsePairKey, playerSubject } from '../../domain/stats/subjects.js';
import { PAGES } from './pages.js';
import { statsHref, subjectPath } from './links.js';
import { mountStatsView, notFound, renderPage, statsHeader } from './render-page.js';

/** #/stats/pair/:pair ('Anne+Bjørn') — the pair's results and how it does against other pairs. */
export function mountStatsPair(root, ctx) {
  const names = parsePairKey(ctx.params.pair);

  return mountStatsView(root, ctx, (page, data) => {
    const known = (name) => data.dataset.players.some((p) => p.name === name);
    if (!names || !names.every(known)) {
      page.append(...notFound(ctx));
      return undefined;
    }
    const [a, b] = names;
    const subject = pairSubject(a, b);
    const link = (target, text) => h('a', { class: 'link', href: statsHref(subjectPath(target), ctx.query) }, text);
    page.append(statsHeader({
      title: t.statsUi.pair(a, b),
      path: subjectPath(subject),
      extra: [h('nav', { class: 'stats-links' },
        link(playerSubject(a), a),
        link(playerSubject(b), b),
        link(compareSubject(a, b), `${a} ${t.statsUi.versus} ${b}`))],
    }, ctx, data));
    return renderPage(page, PAGES.pair, data.facts, subject, ctx);
  });
}
