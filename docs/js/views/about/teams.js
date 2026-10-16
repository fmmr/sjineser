import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { BALANCE_TOLERANCE, BENCH_RULES, MAX_PLAYING, SPLIT_RULES, TEAM_SIZES } from '../../domain/proposal.js';

/** Rendered from the rule definitions, so the page always matches what the app does. */
export function mountAboutTeams(root) {
  const describe = (text) => (typeof text === 'function' ? text({ tolerance: BALANCE_TOLERANCE }) : text);
  const ruleList = (rules) =>
    h('ol', { class: 'rule-list' }, rules.map(({ id }) =>
      h('li', {},
        h('strong', {}, t.rules[id].title),
        h('p', { class: 'muted' }, describe(t.rules[id].description)))));
  const sizes = Object.entries(TEAM_SIZES).map(([players, [a, b]]) => t.about.teamSize(players, a, b));
  const [moreA, moreB] = TEAM_SIZES[MAX_PLAYING];

  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.about.teamsTitle),
      h('p', {}, t.about.teamsIntro),
      h('h2', {}, t.about.sizesHeading),
      h('p', { class: 'muted' }, t.about.sizesIntro),
      h('ul', { class: 'rule-list' }, [...sizes, t.about.teamSizeMore(MAX_PLAYING, moreA, moreB)].map((text) => h('li', {}, text))),
      h('h2', {}, t.about.benchHeading),
      h('p', { class: 'muted' }, t.about.benchIntro(MAX_PLAYING)),
      ruleList(BENCH_RULES),
      h('h2', {}, t.about.splitHeading),
      h('p', { class: 'muted' }, t.about.splitIntro),
      ruleList(SPLIT_RULES)),
  );
  return {};
}
