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
 * Ops are marked sent before the first attempt and from then on cannot be retracted.
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
  const saved = storage.get('outbox', []);
  let queue = Array.isArray(saved) ? saved : [];
  let held = false;
  let attempt = 0;
  let retryTimer = null;
  let running = null;

  function save() {
    storage.set('outbox', queue);
    onChange();
  }

  function remove(ops) {
    const ids = new Set(ops.map((o) => o.id));
    queue = queue.filter((o) => !ids.has(o.id));
    save();
  }

  /** Flags the op as possibly seen by the server, so it can no longer be retracted. */
  function markSent(op) {
    if (op.sent) return op;
    queue = queue.map((o) => (o.id === op.id ? { ...o, sent: true } : o));
    save();
    return queue.find((o) => o.id === op.id);
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
      flush().catch(() => {});
    }, delay);
  }

  async function drain() {
    while (queue.length > 0 && !held) {
      try {
        const op = markSent(queue[0]);
        const response = await sendSafely(op);

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
          const dropped = [op, ...queue.filter((o) => o.id !== op.id && dependsOn(o, op))];
          remove(dropped);
          onDrop(op, response, dropped);
        } else {
          scheduleRetry();
          return;
        }
      } catch {
        // A throwing callback or storage must not stall the queue; the op is retried later.
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
      flush().catch(() => {});
      return op;
    },
    /** Removes the newest op matching `predicate`, unless it may already have reached the server. */
    retract(predicate) {
      const op = queue.findLast((o) => !o.sent && predicate(o));
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
