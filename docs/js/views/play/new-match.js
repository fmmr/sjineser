import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { byName } from '../../domain/players.js';
import { currentMatch, currentNight, gamesOf, score } from '../../domain/match.js';

const TEAM_SIZE = 2;
const NEXT_SIDE = { bench: 'A', A: 'B', B: 'bench' };

export function mountNewMatch(root, { store, actions, navigate }) {
  /** @type {Map<string, 'A' | 'B'>} players not in the map are on the bench */
  const sides = new Map();
  const count = (side) => [...sides.values()].filter((s) => s === side).length;
  const team = (side) => [...sides].filter(([, s]) => s === side).map(([name]) => name).sort(byName);

  /** Moves a player bench → A → B → bench, skipping full teams. */
  function cycle(name) {
    let side = NEXT_SIDE[sides.get(name) ?? 'bench'];
    if (side === 'A' && count('A') === TEAM_SIZE) side = 'B';
    if (side === 'B' && count('B') === TEAM_SIZE) side = 'bench';
    if (side === 'bench') sides.delete(name);
    else sides.set(name, side);
    update();
  }

  function confirmAbandon() {
    const open = currentMatch(store.get());
    const games = open ? gamesOf(store.get(), open.matchId) : [];
    if (games.length === 0) return true;
    const { A, B } = score(games);
    return window.confirm(t.abandonConfirm(A, B));
  }

  function start() {
    if (!confirmAbandon()) return;
    const [A1, A2] = team('A');
    const [B1, B2] = team('B');
    const result = actions.startMatch({ A1, A2, B1, B2 });
    if (!result.ok) return showToast(t.errors[result.error]);
    navigate('/play/match');
  }

  function update() {
    const night = currentNight(store.get());
    if (!night) {
      root.replaceChildren(h('p', { class: 'muted' }, t.errors.noNight));
      return;
    }
    const ready = count('A') === TEAM_SIZE && count('B') === TEAM_SIZE;
    root.replaceChildren(
      h('section', { class: 'stack' },
        h('h1', {}, t.newMatch),
        h('p', { class: 'muted' }, t.pickTeams),
        h('ul', { class: 'assign-list' }, night.players.map((name) => {
          const side = sides.get(name) ?? 'bench';
          return h('li', {},
            h('button', { class: 'assign-row', type: 'button', 'data-side': side, onclick: () => cycle(name) },
              h('span', {}, name),
              h('span', { class: 'assign-side' }, t.sides[side])));
        })),
        h('button', { class: 'btn btn-primary', disabled: !ready, onclick: start }, t.startMatch)),
    );
  }

  update();
  return { update };
}
