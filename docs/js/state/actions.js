import { applyOp } from '../domain/dataset.js';
import { toISODate } from '../domain/dates.js';
import { validateNewName } from '../domain/players.js';
import {
  currentMatch, currentNight, gamesOf, latestMatch, nextGameNo, nextMatchId, validSeats,
} from '../domain/match.js';

/**
 * User intents. Each validates against the current view, enqueues ops and
 * returns { ok: true } or { ok: false, error } where error is a key of t.errors.
 */
export function createActions({ store, outbox, today = () => toISODate(new Date()), now = () => new Date().toISOString() }) {
  const view = () => store.get();

  function submit(action, payload) {
    const { outcome } = applyOp(view(), { action, payload });
    if (outcome === 'invalid' || outcome === 'conflict') return { ok: false, error: outcome };
    if (outcome === 'applied') outbox.enqueue(action, payload);
    return { ok: true };
  }

  /**
   * Takes back an earlier op: drop it if still unsent, otherwise enqueue its inverse.
   * @returns {boolean} true if the original was retracted
   */
  function revert(isOriginal, inverseAction, inversePayload) {
    if (outbox.retract(isOriginal)) return true;
    outbox.enqueue(inverseAction, inversePayload);
    return false;
  }

  const removeGame = (matchId, gameNo) => revert(
    (op) => op.action === 'addGame' && op.payload.matchId === matchId && op.payload.gameNo === gameNo,
    'deleteGame', { matchId, gameNo },
  );

  const removeMatch = (matchId) => revert(
    (op) => op.action === 'startMatch' && op.payload.matchId === matchId,
    'deleteMatch', { matchId },
  );

  return {
    addPlayer(name) {
      const error = validateNewName(name, view().players);
      return error ? { ok: false, error } : submit('addPlayer', { name: name.trim() });
    },

    startNight(players) {
      return submit('startNight', { date: today(), players });
    },

    /** Starts the next match. An empty current match is abandoned by removing it. */
    startMatch({ A1, A2, B1, B2 }) {
      const night = currentNight(view());
      if (!night) return { ok: false, error: 'noNight' };
      if (!validSeats({ A1, A2, B1, B2 })) return { ok: false, error: 'invalid' };
      let matchId = nextMatchId(view(), night.date);
      const open = currentMatch(view());
      // The number of a match the server may have seen is never reused: its deleteMatch might be dropped.
      if (open && gamesOf(view(), open.matchId).length === 0 && removeMatch(open.matchId)) {
        matchId = nextMatchId(view(), night.date);
      }
      return submit('startMatch', { matchId, date: night.date, A1, A2, B1, B2 });
    },

    recordGame(result) {
      const match = currentMatch(view());
      if (!match) return { ok: false, error: 'noMatch' };
      const gameNo = nextGameNo(gamesOf(view(), match.matchId));
      return submit('addGame', { matchId: match.matchId, gameNo, result, timestamp: now() });
    },

    /** Removes the last game of the latest match (even if complete), or the match itself if it has none. */
    undo() {
      const match = latestMatch(view());
      if (!match) return { ok: false, error: 'nothingToUndo' };
      const last = gamesOf(view(), match.matchId).at(-1);
      if (last) removeGame(match.matchId, last.gameNo);
      else removeMatch(match.matchId);
      return { ok: true };
    },
  };
}
