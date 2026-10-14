import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';

export function mountStats(root) {
  root.replaceChildren(
    h('section', { class: 'stack' },
      h('p', { class: 'muted' }, t.statsComingSoon),
      h('a', { class: 'link', href: '#/about/rating' }, t.about.ratingLink)),
  );
  return {};
}
