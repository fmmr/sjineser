import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { POLL_MS, TAP_COOLDOWN_MS } from '../../config.js';
import { currentNight, gamesOf, latestMatch, parseMatchId, score, teamOf, winnerOf } from '../../domain/match.js';

const RESULT_ORDER = ['A', 'D', 'B'];
/** Length of the score pop (.score-bump in play.css). */
const BUMP_MS = 320;

/**
 * Sides whose score differs from what was shown before, so only a real change animates
 * (store polls re-render the screen with the same numbers).
 * @param {{ matchId: string, A: number, B: number } | null} before
 * @param {{ matchId: string, A: number, B: number }} after
 * @returns {('A' | 'B')[]}
 */
export function changedSides(before, after) {
  if (!before || before.matchId !== after.matchId) return [];
  return ['A', 'B'].filter((side) => before[side] !== after[side]);
}

/** tapCooldownMs: taps closer together than this count as one (guards against double taps). */
export function mountMatch(root, { store, actions, navigate, tapCooldownMs = TAP_COOLDOWN_MS }) {
  let lastTap = 0;
  /** The score last rendered, to spot changes. */
  let shown = null;
  /** When each side's score last changed. */
  const changedAt = { A: -Infinity, B: -Infinity };
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') store.refresh();
  }, POLL_MS);

  /** Wraps a tap handler so all match-screen actions share one cooldown. */
  const guardTap = (fn) => (...args) => {
    const now = Date.now();
    if (now - lastTap < tapCooldownMs) return;
    lastTap = now;
    fn(...args);
  };

  const record = guardTap((result) => {
    const outcome = actions.recordGame(result);
    if (!outcome.ok) return showToast(t.errors[outcome.error]);
    navigator.vibrate?.(10); // a short tick where supported (not on iOS)
  });

  const undo = guardTap(() => {
    const outcome = actions.undo();
    if (!outcome.ok) showToast(t.errors[outcome.error]);
  });

  const nextMatch = guardTap(() => navigate('/play/new-match'));

  /**
   * A just-changed score pops. The store often re-renders again within the pop (the server
   * confirms the game), so a fresh element continues the pop where it was instead of restarting.
   */
  function scoreEl(side, wins) {
    const el = h('span', { class: 'score' }, String(wins));
    const elapsed = Date.now() - changedAt[side];
    if (elapsed < BUMP_MS) {
      el.classList.add('score-bump');
      el.style.setProperty('--bump-offset', `${-elapsed}ms`);
    }
    return el;
  }

  const teamPanel = (match, side, wins, winner) =>
    h('div', { class: 'team-panel', 'data-side': side, 'data-winner': String(winner === side) },
      h('span', { class: 'team-names' }, t.names(teamOf(match, side))),
      scoreEl(side, wins));

  const resultButtons = () =>
    h('div', { class: 'result-buttons' }, RESULT_ORDER.map((result) =>
      h('button', { class: 'btn btn-result', type: 'button', 'data-side': result, onclick: () => record(result) }, t.results[result])));

  const winnerBanner = (match, winner, totals) =>
    h('div', { class: 'winner-banner', 'data-side': winner },
      h('p', {}, t.matchWon(t.names(teamOf(match, winner)), totals[winner], totals[winner === 'A' ? 'B' : 'A'])),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: nextMatch }, t.nextMatch));

  const noMatch = () =>
    h('section', { class: 'stack' },
      h('p', { class: 'muted' }, t.noMatch),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => navigate('/play/new-match') }, t.newMatch));

  function update() {
    const ds = store.get();
    if (!currentNight(ds)) {
      // Nothing cached and the first fetch is done (or failed offline): nothing to show here.
      if (store.isLoaded() || store.hasTried()) navigate('/play');
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
    const now = { matchId: match.matchId, A: totals.A, B: totals.B };
    changedSides(shown, now).forEach((side) => { changedAt[side] = Date.now(); });
    shown = now;
    root.replaceChildren(
      h('section', { class: 'match stack' },
        h('h1', {}, t.matchTitle(parseMatchId(match.matchId).number)),
        h('div', { class: 'teams' }, teamPanel(match, 'A', totals.A, winner), teamPanel(match, 'B', totals.B, winner)),
        h('p', { class: 'draws center' }, t.draws(totals.D)),
        h('ol', { class: 'sequence' }, games.map((g) => h('li', { 'data-side': g.result }, t.resultShort[g.result]))),
        winner ? winnerBanner(match, winner, totals) : resultButtons(),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: undo }, t.undo)),
    );
  }

  update();
  store.refresh();
  return { update, destroy: () => clearInterval(poll) };
}
