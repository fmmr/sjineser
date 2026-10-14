import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { byName } from '../../domain/players.js';
import { currentMatch, currentNight, gamesOf, score } from '../../domain/match.js';
import { isProvisional, rateGames, ratingOf } from '../../domain/elo.js';
import { proposeTeams } from '../../domain/proposal.js';

const TEAM_SIZE = 2;
const NEXT_SIDE = { bench: 'A', A: 'B', B: 'bench' };

export function mountNewMatch(root, { store, actions, navigate }) {
  /** @type {Map<string, 'A' | 'B'>} players not in the map are on the bench */
  const sides = new Map();
  /** Set once the user changes the proposal; from then on store updates keep their choice. */
  let touched = false;
  /** Set once a start is under way, so a second tap cannot start another match. */
  let starting = false;
  const count = (side) => [...sides.values()].filter((s) => s === side).length;
  const team = (side) => [...sides].filter(([, s]) => s === side).map(([name]) => name).sort(byName);

  function applyProposal(proposal) {
    sides.clear();
    proposal?.A.forEach((name) => sides.set(name, 'A'));
    proposal?.B.forEach((name) => sides.set(name, 'B'));
  }

  /** Moves a player bench → A → B → bench, skipping full teams. */
  function cycle(name) {
    touched = true;
    let side = NEXT_SIDE[sides.get(name) ?? 'bench'];
    if (side === 'A' && count('A') === TEAM_SIZE) side = 'B';
    if (side === 'B' && count('B') === TEAM_SIZE) side = 'bench';
    if (side === 'bench') sides.delete(name);
    else sides.set(name, side);
    update();
  }

  function useProposal() {
    touched = false;
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
    if (starting || !confirmAbandon()) return;
    starting = true;
    update();
    const [A1, A2] = team('A');
    const [B1, B2] = team('B');
    const result = actions.startMatch({ A1, A2, B1, B2 });
    if (!result.ok) {
      starting = false;
      update();
      return showToast(t.errors[result.error]);
    }
    navigate('/play/match');
  }

  const reasons = (proposal) => [
    proposal.bench.length > 0 && t.proposal.bench(proposal.bench.join(t.and), t.rules[proposal.benchRule].title),
    proposal.splitRule ? t.proposal.split(t.rules[proposal.splitRule].title) : t.proposal.splitTie,
  ].filter(Boolean);

  const playerRow = (name, rated) => {
    const side = sides.get(name) ?? 'bench';
    const rating = Math.round(ratingOf(rated, name));
    return h('li', {},
      h('button', { class: 'assign-row', type: 'button', 'data-side': side, onclick: () => cycle(name) },
        h('span', { class: 'assign-name' }, name),
        h('span', { class: 'assign-rating' }, isProvisional(rated, name) ? `${rating} · ${t.provisional}` : String(rating)),
        h('span', { class: 'assign-side' }, t.sides[side])));
  };

  function update() {
    const ds = store.get();
    const night = currentNight(ds);
    if (!night) {
      root.replaceChildren(h('p', { class: 'muted' }, t.errors.noNight));
      return;
    }
    const rated = rateGames(ds);
    const proposal = proposeTeams(ds, rated);
    if (!touched) applyProposal(proposal);
    const ready = count('A') === TEAM_SIZE && count('B') === TEAM_SIZE;

    root.replaceChildren(
      h('section', { class: 'stack' },
        h('h1', {}, t.newMatch),
        proposal && !touched && h('ul', { class: 'proposal-reasons' }, reasons(proposal).map((text) => h('li', {}, text))),
        touched && proposal && h('button', { class: 'btn btn-ghost', type: 'button', onclick: useProposal }, t.proposal.useProposal),
        h('p', { class: 'muted' }, t.pickTeams),
        h('ul', { class: 'assign-list' }, night.players.map((name) => playerRow(name, rated))),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !ready || starting, onclick: start }, t.startMatch),
        h('a', { class: 'link center', href: '#/about/teams' }, t.about.teamsLink)),
    );
  }

  update();
  return { update };
}
