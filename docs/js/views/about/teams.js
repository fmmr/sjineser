import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { BALANCE_TOLERANCE, BENCH_RULES, SPLIT_RULES } from '../../domain/proposal.js';

/** Rendered from the rule definitions, so the page always matches what the app does. */
export function mountAboutTeams(root) {
  const describe = (text) => (typeof text === 'function' ? text({ tolerance: BALANCE_TOLERANCE }) : text);
  const ruleList = (rules) =>
    h('ol', { class: 'rule-list' }, rules.map(({ id }) =>
      h('li', {},
        h('strong', {}, t.rules[id].title),
        h('p', { class: 'muted' }, describe(t.rules[id].description)))));

  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.about.teamsTitle),
      h('p', {}, t.about.teamsIntro),
      h('h2', {}, t.about.benchHeading),
      h('p', { class: 'muted' }, t.about.benchIntro),
      ruleList(BENCH_RULES),
      h('h2', {}, t.about.splitHeading),
      h('p', { class: 'muted' }, t.about.splitIntro),
      ruleList(SPLIT_RULES)),
  );
  return {};
}
