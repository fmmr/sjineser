import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { ELO } from '../../domain/elo.js';

/** Rendered from the Elo constants, so the page always matches the calculation. */
export function mountAboutRating(root) {
  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.about.ratingTitle),
      t.about.ratingParagraphs(ELO).map((text) => h('p', {}, text))),
  );
  return {};
}
