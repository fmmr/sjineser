import { applyOp } from '../domain/dataset.js';
import { createClock } from './clock.js';
import { findPlayer, hasHistory, validateNewName, validateRename } from '../domain/players.js';
import {
  SEATS, activeNight, currentMatch, gamesOf, latestMatch, nextGameNo, nextMatchId, parseMatchId, validSeats,
} from '../domain/match.js';

/**
 * User intents. Each validates against the current view, enqueues ops and
 * returns { ok: true } or { ok: false, error } where error is a key of t.errors.
 * Play writes only into the active night (domain activeNight: until noon the next day).
 * @param {{ store: object, outbox: object, clock?: { today(): string, hour(): number }, now?: () => string }} options
 */
export function createActions({ store, outbox, clock = createClock(), now = () => new Date().toISOString() }) {
  const view = () => store.get();
  const night = () => activeNight(view(), clock.today(), clock.hour());

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

  /**
   * The next match number of the night that neither the view nor any pending op uses.
   * A number is reused only when no op referencing it may still reach the server.
   */
  function nextFreeMatchId(date) {
    const pendingIds = outbox.pending()
      .map((op) => op.payload?.matchId)
      .filter((matchId) => typeof matchId === 'string');
    const matches = [
      ...view().matches,
      ...pendingIds.map((matchId) => ({ matchId, date: parseMatchId(matchId).date })),
    ];
    return nextMatchId({ matches }, date);
  }

  return {
    addPlayer(name) {
      const error = validateNewName(name, view().players);
      return error ? { ok: false, error } : submit('addPlayer', { name: name.trim() });
    },

    /** Renames a player in Players, every night roster and every match seat. */
    renamePlayer(from, to) {
      const player = findPlayer(view().players, from);
      if (!player) return { ok: false, error: 'unknownPlayer' };
      const error = validateRename(player.name, to, view().players);
      return error ? { ok: false, error } : submit('renamePlayer', { from: player.name, to: to.trim() });
    },

    /** Inactive players keep their history but are hidden from the start-night picker. */
    setPlayerActive(name, active) {
      const player = findPlayer(view().players, name);
      if (!player) return { ok: false, error: 'unknownPlayer' };
      return submit('setPlayerActive', { name: player.name, active });
    },

    /** Only players who were never on a roster or in a match can be deleted. */
    deletePlayer(name) {
      const player = findPlayer(view().players, name);
      if (!player) return { ok: false, error: 'unknownPlayer' };
      if (hasHistory(view(), player.name)) return { ok: false, error: 'inUse' };
      return submit('deletePlayer', { name: player.name });
    },

    /** Refused while a night is still ongoing, so there is only ever one night to play in. */
    startNight(players) {
      if (night()) return { ok: false, error: 'nightOngoing' };
      return submit('startNight', { date: clock.today(), players });
    },

    /**
     * Starts the next match. Teams have 2 or 3 players; A3 / B3 may be left out (or '') for
     * a 2-player team. An empty current match is abandoned by removing it.
     * @param {{ A1: string, A2: string, A3?: string, B1: string, B2: string, B3?: string }} seats
     */
    startMatch(seats) {
      const active = night();
      if (!active) return { ok: false, error: 'noNight' };
      const filled = Object.fromEntries(SEATS.map((seat) => [seat, seats[seat] ?? '']));
      if (!validSeats(filled)) return { ok: false, error: 'invalid' };
      const open = currentMatch(view());
      if (open && gamesOf(view(), open.matchId).length === 0) removeMatch(open.matchId);
      const matchId = nextFreeMatchId(active.date);
      return submit('startMatch', { matchId, date: active.date, ...filled });
    },

    recordGame(result) {
      if (!night()) return { ok: false, error: 'noNight' };
      const match = currentMatch(view());
      if (!match) return { ok: false, error: 'noMatch' };
      const gameNo = nextGameNo(gamesOf(view(), match.matchId));
      return submit('addGame', { matchId: match.matchId, gameNo, result, timestamp: now() });
    },

    /** Removes the last game of the latest match (even if complete), or the match itself if it has none. */
    undo() {
      if (!night()) return { ok: false, error: 'noNight' };
      const match = latestMatch(view());
      if (!match) return { ok: false, error: 'nothingToUndo' };
      const last = gamesOf(view(), match.matchId).at(-1);
      if (last) removeGame(match.matchId, last.gameNo);
      else removeMatch(match.matchId);
      return { ok: true };
    },
  };
}
