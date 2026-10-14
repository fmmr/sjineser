import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';

export function mountStats(root) {
  root.replaceChildren(h('p', { class: 'muted' }, t.statsComingSoon));
  return {};
}
