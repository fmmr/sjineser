import { parseMatchId } from '../domain/match.js';

const DROP_ERRORS = new Set(['conflict', 'invalid']);
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

/** The night and match an op belongs to. */
export function opScope(op) {
  if (op.action === 'startNight') return { night: op.payload.date, match: null };
  if (op.payload.matchId) return { night: parseMatchId(op.payload.matchId).date, match: op.payload.matchId };
  return { night: null, match: null };
}

/** True if `later` must be dropped because `dropped` was. */
export function dependsOn(later, dropped) {
  const d = opScope(dropped);
  const l = opScope(later);
  if (dropped.action === 'startNight') return l.night === d.night;
  return d.match !== null && l.match === d.match;
}

/**
 * Persistent write queue. Sends strictly one op at a time, in order.
 * - ok → onSent(op), removed
 * - conflict/invalid → dropped with all dependent ops, onDrop(op, response, dropped)
 * - pin → queue held until resume(), onPinRequired()
 * - anything else → kept, retried with backoff
 */
export function createOutbox({
  storage,
  send,
  onSent = () => {},
  onChange = () => {},
  onDrop = () => {},
  onPinRequired = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms),
  newId = () => crypto.randomUUID(),
}) {
  let queue = storage.get('outbox', []);
  let inFlightId = null;
  let held = false;
  let attempt = 0;
  let retryTimer = null;
  let running = null;

  function save() {
    storage.set('outbox', queue);
    onChange();
  }

  function remove(ops) {
    queue = queue.filter((o) => !ops.includes(o));
    save();
  }

  async function sendSafely(op) {
    try {
      return await send(op);
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  function scheduleRetry() {
    if (retryTimer !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      flush();
    }, delay);
  }

  async function drain() {
    while (queue.length > 0 && !held) {
      const op = queue[0];
      inFlightId = op.id;
      const response = await sendSafely(op);
      inFlightId = null;

      if (response.ok) {
        attempt = 0;
        onSent(op, response);
        remove([op]);
      } else if (response.error === 'pin') {
        held = true;
        onChange();
        onPinRequired();
        // onPinRequired may prompt synchronously and call resume(); if so, keep draining here,
        // because resume()'s flush() returns this already-running drain.
        if (held) return;
      } else if (DROP_ERRORS.has(response.error)) {
        attempt = 0;
        const dropped = [op, ...queue.filter((o) => o !== op && dependsOn(o, op))];
        remove(dropped);
        onDrop(op, response, dropped);
      } else {
        scheduleRetry();
        return;
      }
    }
  }

  /** Starts sending if idle; returns the active drain so callers can await it. */
  function flush() {
    running ??= drain().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    enqueue(action, payload) {
      const op = { id: newId(), action, payload };
      queue = [...queue, op];
      save();
      flush();
      return op;
    },
    /** Removes the newest queued op matching `predicate`, unless it is in flight. */
    retract(predicate) {
      const op = queue.findLast((o) => o.id !== inFlightId && predicate(o));
      if (!op) return false;
      remove([op]);
      return true;
    },
    resume() {
      held = false;
      attempt = 0;
      onChange();
      return flush();
    },
    flush,
    pending: () => queue,
    isHeld: () => held,
  };
}
