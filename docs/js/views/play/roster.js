import { h } from '../components/dom.js';
import { listGroup, rowText } from '../components/list.js';
import { confirmSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { activePlayers, byName } from '../../domain/players.js';
import { MIN_TEAM_SIZE, activeNight, availablePlayers, currentMatch, leftOf, playersOf } from '../../domain/match.js';

const MIN_PLAYERS = 2 * MIN_TEAM_SIZE;

/**
 * #/play/roster: who is here tonight. A switch per player on the active night's roster (on = here,
 * off = gone home), and active players not on the roster (or a new one) can be added. "Ferdig"
 * returns to the new-match screen when opened from there (?from=new-match), else to Spill.
 */
export function mountRoster(root, { store, actions, navigate, clock, query = {} }) {
  const list = h('div', { class: 'more' });
  const chips = h('div', { class: 'chips' });
  const input = h('input', {
    class: 'field', type: 'text', placeholder: t.newPlayerPlaceholder, autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': t.newPlayerPlaceholder,
  });
  const back = query.from === 'new-match' ? '/play/new-match' : '/play';

  const report = (result, message) => showToast(result.ok ? message : t.errors[result.error]);

  function addNew(event) {
    event.preventDefault();
    const name = input.value.trim();
    const result = actions.addPlayerToNight(input.value);
    if (result.ok) input.value = '';
    report(result, t.roster.joined(name));
  }

  /** Someone seated in the match in progress may still go home, after a warning. */
  async function leave(name) {
    const open = currentMatch(store.get());
    if (open && playersOf(open).includes(name)) {
      const sure = await confirmSheet({
        title: t.roster.leaveTitle(name),
        message: t.roster.leaveMessage,
        confirmLabel: t.roster.leaveConfirm,
      });
      if (!sure) return;
    }
    const result = actions.leaveNight(name);
    if (!result.ok) showToast(t.errors[result.error]);
  }

  function join(name) {
    const result = actions.joinNight(name);
    if (!result.ok) showToast(t.errors[result.error]);
  }

  function rosterRow(name, here, i) {
    const ids = { label: `roster-${i}-name`, sub: `roster-${i}-sub` };
    return h('div', { class: 'list-row list-row-control' },
      rowText(name, here ? null : t.roster.left, ids),
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(here),
        'aria-label': t.roster.hereLabel(name),
        'data-focus': `here:${name}`,
        onclick: () => (here ? leave(name) : join(name)),
      }, h('span', { class: 'switch-thumb', 'aria-hidden': 'true' })));
  }

  const addChip = (name) =>
    h('button', { class: 'chip', type: 'button', 'data-focus': `add:${name}`, onclick: () => join(name) }, t.roster.addChip(name));

  function update() {
    const ds = store.get();
    const night = activeNight(ds, clock.today(), clock.hour());
    if (!night) {
      root.replaceChildren(h('section', { class: 'stack' },
        h('h1', {}, t.roster.title),
        h('p', { class: 'muted' }, t.errors.noNight),
        h('a', { class: 'link', href: '#/play' }, t.backToNight)));
      return;
    }
    if (!root.contains(list)) {
      root.replaceChildren(h('section', { class: 'more' },
        h('h1', {}, t.roster.title),
        list,
        h('section', { class: 'list-group', 'aria-labelledby': 'roster-add' },
          h('h2', { class: 'list-heading', id: 'roster-add' }, t.roster.addHeading),
          chips,
          h('form', { class: 'inline-form', onsubmit: addNew }, input, h('button', { class: 'btn', type: 'submit' }, t.addPlayer))),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => navigate(back) }, t.roster.done)));
    }

    const focused = document.activeElement?.dataset?.focus;
    const left = leftOf(night);
    const here = availablePlayers(night);
    const roster = [...night.players].sort(byName);
    const others = activePlayers(ds.players).map((p) => p.name).filter((name) => !night.players.includes(name));
    list.replaceChildren(listGroup('roster-here', t.roster.hereHeading(here.length),
      roster.map((name, i) => rosterRow(name, !left.includes(name), i)),
      here.length < MIN_PLAYERS && h('p', { class: 'list-note' }, t.roster.tooFew(here.length, MIN_PLAYERS))));
    chips.replaceChildren(...(others.length > 0 ? others.map(addChip) : [h('p', { class: 'list-note' }, t.roster.noneToAdd)]));
    // Rows and chips are rebuilt on every change; keep focus on the control that was used (an added
    // player's chip becomes their switch).
    const target = focused?.replace(/^add:/, 'here:');
    if (target) [...root.querySelectorAll('[data-focus]')].find((el) => el.dataset.focus === target)?.focus();
  }

  update();
  return { update };
}
