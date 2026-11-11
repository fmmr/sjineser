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
 * sendNightSummary is the one exception: a one-shot request straight to the api, never queued.
 * @param {{ store: object, outbox: object, clock?: { today(): string, hour(): number }, now?: () => string,
 *   api?: { post(action: string, payload: object, pin: string): Promise<object> }, pin?: () => string,
 *   online?: () => boolean, askPin?: () => Promise<void> }} options
 *   api, pin, online, askPin: for sendNightSummary (the stored PIN; whether the browser is online;
 *   asks for the PIN and stores it)
 */
export function createActions({
  store, outbox, clock = createClock(), now = () => new Date().toISOString(),
  api = null, pin = () => '', online = () => globalThis.navigator?.onLine !== false, askPin = async () => {},
}) {
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

    /** Puts an existing player on the active night's roster, or brings back one who went home. */
    joinNight(name) {
      const active = night();
      if (!active) return { ok: false, error: 'noNight' };
      const player = findPlayer(view().players, name);
      if (!player) return { ok: false, error: 'unknownPlayer' };
      return submit('joinNight', { date: active.date, name: player.name });
    },

    /** Marks a player on the active night's roster as gone home. */
    leaveNight(name) {
      const active = night();
      if (!active) return { ok: false, error: 'noNight' };
      const player = findPlayer(view().players, name);
      if (!player || !active.players.includes(player.name)) return { ok: false, error: 'unknownPlayer' };
      return submit('leaveNight', { date: active.date, name: player.name });
    },

    /** Creates a new player (same rules as addPlayer) and puts them on the active night's roster. */
    addPlayerToNight(name) {
      const active = night();
      if (!active) return { ok: false, error: 'noNight' };
      const error = validateNewName(name, view().players);
      if (error) return { ok: false, error };
      const added = submit('addPlayer', { name: name.trim() });
      return added.ok ? submit('joinNight', { date: active.date, name: name.trim() }) : added;
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

    /**
     * Emails a night's summary (built by the caller) to the active players with an address, or
     * with `testPlayer` only to that player. Sent at once, never queued: offline it fails and the
     * user tries again. A wrong PIN asks for it once and retries. Any night, also after it is over.
     * @param {string} date
     * @param {{ subject: string, text: string }} mail
     * @param {{ testPlayer?: string }} [options]
     * @returns {Promise<{ ok: true, recipients: number } | { ok: false, error: string }>}
     */
    async sendNightSummary(date, { subject, text }, { testPlayer } = {}) {
      if (!view().nights.some((n) => n.date === date)) return { ok: false, error: 'invalid' };
      if (!online()) return { ok: false, error: 'offline' };
      const payload = { date, subject, text, ...(testPlayer ? { testPlayer } : {}) };
      const send = () => api.post('sendNightSummary', payload, pin());
      let response = await send();
      if (!response.ok && response.error === 'pin') {
        const before = pin();
        await askPin();
        if (pin() !== before) response = await send();
      }
      if (response.ok) return { ok: true, recipients: response.data?.recipients ?? 0 };
      return { ok: false, error: mailError(response) };
    },
  };
}

/** The t.errors key for a failed sendNightSummary reply. */
function mailError({ error, message }) {
  if (error === 'pin' || error === 'network') return error;
  if (error === 'quota') return 'mailQuota';
  if (error === 'invalid' && message === NO_RECIPIENTS) return 'noRecipients';
  if (error === 'invalid' && message === NO_TEST_RECIPIENT) return 'noTestRecipient';
  return 'sendFailed';
}

/** The server's messages for a summary nobody would receive, and a test player without an address (apps-script/Code.js). */
const NO_RECIPIENTS = 'No recipients';
const NO_TEST_RECIPIENT = 'Test player has no email';
