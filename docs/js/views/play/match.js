import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { POLL_MS } from '../../config.js';
import { currentNight, gamesOf, latestMatch, parseMatchId, score, teamOf, winnerOf } from '../../domain/match.js';

/** Ignores a second tap this soon after the first, so a double tap does not record two games. */
const TAP_COOLDOWN_MS = 800;
const RESULT_ORDER = ['A', 'D', 'B'];

export function mountMatch(root, { store, actions, navigate }) {
  let lastTap = 0;
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') store.refresh();
  }, POLL_MS);

  function record(result) {
    const now = Date.now();
    if (now - lastTap < TAP_COOLDOWN_MS) return;
    lastTap = now;
    const outcome = actions.recordGame(result);
    if (!outcome.ok) showToast(t.errors[outcome.error]);
  }

  function undo() {
    const outcome = actions.undo();
    if (!outcome.ok) showToast(t.errors[outcome.error]);
  }

  const teamPanel = (match, side, wins, winner) =>
    h('div', { class: 'team-panel', 'data-side': side, 'data-winner': String(winner === side) },
      h('span', { class: 'team-names' }, teamOf(match, side).join(t.and)),
      h('span', { class: 'score' }, String(wins)));

  const resultButtons = () =>
    h('div', { class: 'result-buttons' }, RESULT_ORDER.map((result) =>
      h('button', { class: 'btn btn-result', type: 'button', 'data-side': result, onclick: () => record(result) }, t.results[result])));

  const winnerBanner = (match, winner, totals) =>
    h('div', { class: 'winner-banner', 'data-side': winner },
      h('p', {}, t.matchWon(teamOf(match, winner).join(t.and), totals[winner], totals[winner === 'A' ? 'B' : 'A'])),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/play/new-match') }, t.nextMatch));

  const noMatch = () =>
    h('section', { class: 'stack' },
      h('p', { class: 'muted' }, t.noMatch),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/play/new-match') }, t.newMatch));

  function update() {
    const ds = store.get();
    if (!currentNight(ds)) {
      if (store.isLoaded()) navigate('/play');
      else root.replaceChildren(h('p', { class: 'muted' }, t.loading));
      return;
    }
    const match = latestMatch(ds);
    if (!match) {
      root.replaceChildren(noMatch());
      return;
    }
    const games = gamesOf(ds, match.matchId);
    const totals = score(games);
    const winner = winnerOf(games);
    root.replaceChildren(
      h('section', { class: 'match stack' },
        h('h1', {}, t.matchTitle(parseMatchId(match.matchId).number)),
        h('div', { class: 'teams' }, teamPanel(match, 'A', totals.A, winner), teamPanel(match, 'B', totals.B, winner)),
        h('p', { class: 'muted center' }, t.draws(totals.D)),
        h('ol', { class: 'sequence' }, games.map((g) => h('li', { 'data-side': g.result }, t.resultShort[g.result]))),
        winner ? winnerBanner(match, winner, totals) : resultButtons(),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: undo }, t.undo)),
    );
  }

  update();
  store.refresh();
  return { update, destroy: () => clearInterval(poll) };
}
