import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../../docs/js/state/actions.js';
import { createStore } from '../../docs/js/state/store.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { DATE, FOUR, MATCH_1, dataset, memoryBackend, nightWithMatch } from '../helpers.js';

/** Minimal outbox with the same retract semantics as the real one, plus manual sent marking. */
function fakeOutbox() {
  let n = 0;
  const box = {
    queue: [],
    onChange: () => {},
    enqueue(action, payload) {
      const op = { id: `op${++n}`, action, payload };
      box.queue.push(op);
      box.onChange();
      return op;
    },
    retract(predicate) {
      const op = box.queue.findLast((o) => !o.sent && predicate(o));
      if (!op) return false;
      box.queue = box.queue.filter((o) => o !== op);
      box.onChange();
      return true;
    },
    pending: () => box.queue,
    markSent: (op) => { op.sent = true; },
  };
  return box;
}

/** A fixed clock: `today` and `hour` as given (default: the night of DATE, in the evening). */
const fixedClock = (today = DATE, hour = 20) => ({ today: () => today, hour: () => hour });
/** The day after DATE, at noon: the night of DATE is over. */
const NEXT_NOON = fixedClock('2026-10-15', 12);

function setup(base = dataset(), clock = fixedClock()) {
  const storage = createStorage(memoryBackend());
  storage.set('dataset', base);
  const outbox = fakeOutbox();
  const store = createStore({ storage, outbox, api: { getAll: async () => ({ ok: false }) } });
  outbox.onChange = () => store.recompute();
  const actions = createActions({ store, outbox, clock, now: () => 'T' });
  return { actions, outbox, store };
}

const queued = (outbox) => outbox.queue.map((op) => `${op.action} ${op.payload.matchId ?? op.payload.name ?? op.payload.date}${op.payload.gameNo ? `/${op.payload.gameNo}` : ''}`);
const seats = { A1: 'Hans', A2: 'Per', B1: 'Frode', B2: 'Tor' };

test('addPlayer validates and enqueues the trimmed name', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.addPlayer('hans'), { ok: false, error: 'duplicate' });
  assert.deepEqual(actions.addPlayer(' Kari '), { ok: true });
  assert.deepEqual(queued(outbox), ['addPlayer Kari']);
});

test('startNight uses today and rejects fewer than four players', () => {
  const { actions, outbox } = setup();
  assert.deepEqual(actions.startNight(FOUR.slice(0, 3)), { ok: false, error: 'invalid' });
  assert.deepEqual(actions.startNight(FOUR), { ok: true });
  assert.deepEqual(queued(outbox), [`startNight ${DATE}`]);
});

test('startNight dates the night with the injected today, not the device date', () => {
  const storage = createStorage(memoryBackend());
  storage.set('dataset', dataset());
  const outbox = fakeOutbox();
  const store = createStore({ storage, outbox, api: { getAll: async () => ({ ok: false }) } });
  const actions = createActions({ store, outbox, clock: fixedClock('2030-02-03'), now: () => 'T' });
  actions.startNight(FOUR);
  assert.equal(outbox.queue[0].payload.date, '2030-02-03');
});

test('startMatch needs a night and numbers matches within it', () => {
  assert.deepEqual(setup().actions.startMatch(seats), { ok: false, error: 'noNight' });
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
  assert.equal(store.get().matches.length, 2);
});

test('startMatch sends all six seats; teams of three are kept, missing third seats are empty', () => {
  const night = { ...nightWithMatch(['A', 'A', 'A']), nights: [{ date: DATE, players: [...FOUR, 'Kari'] }] };
  const { actions, outbox, store } = setup(night);
  assert.deepEqual(actions.startMatch({ ...seats, A3: 'Kari' }), { ok: true });
  assert.deepEqual(outbox.queue[0].payload, { matchId: `${DATE}#2`, date: DATE, ...seats, A3: 'Kari', B3: '' });
  assert.deepEqual(store.get().matches.at(-1).A3, 'Kari');
  const two = setup(nightWithMatch(['A', 'A', 'A']));
  two.actions.startMatch(seats);
  assert.deepEqual(two.outbox.queue[0].payload, { matchId: `${DATE}#2`, date: DATE, ...seats, A3: '', B3: '' });
  assert.deepEqual(setup(night).actions.startMatch({ ...seats, A3: 'Hans' }), { ok: false, error: 'invalid' });
});

test('starting a new match replaces an empty unsent match', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  actions.startMatch(seats);
  assert.equal(outbox.queue.length, 1);
  assert.equal(outbox.queue[0].payload.matchId, `${DATE}#1`);
  assert.equal(outbox.queue[0].payload.A2, 'Per');
});

test('starting a new match deletes an empty synced match and takes the next number', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});

test('starting a new match keeps an abandoned match that has games', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'D']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
});

test('invalid seats are rejected without side effects', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.startMatch({ ...seats, A2: 'Hans' }), { ok: false, error: 'invalid' });
  assert.deepEqual(outbox.queue, []);
});

test('recordGame numbers games and stops when the match is complete', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'A']));
  actions.recordGame('D');
  actions.recordGame('A');
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/3`, `addGame ${MATCH_1}/4`]);
  assert.deepEqual(actions.recordGame('B'), { ok: false, error: 'noMatch' });
});

test('undo retracts an unsent game', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  actions.undo();
  assert.deepEqual(outbox.queue, []);
  assert.equal(store.get().games.length, 0);
});

test('undo of a sent game enqueues deleteGame', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  outbox.markSent(outbox.queue[0]);
  actions.undo();
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/1`, `deleteGame ${MATCH_1}/1`]);
  assert.equal(store.get().games.length, 0);
});

test('undo works on a just-completed match', () => {
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteGame ${MATCH_1}/3`]);
  assert.equal(store.get().games.length, 2);
});

test('undo with no games removes the match', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`]);
  assert.deepEqual(setup({ ...nightWithMatch(), matches: [] }).actions.undo(), { ok: false, error: 'nothingToUndo' });
  assert.deepEqual(setup().actions.undo(), { ok: false, error: 'noNight' });
});

test('startMatch, recordGame and undo still write into the night before noon the next day', () => {
  const { actions, outbox } = setup(nightWithMatch(['A']), fixedClock('2026-10-15', 11));
  assert.deepEqual(actions.recordGame('B'), { ok: true });
  assert.deepEqual(actions.undo(), { ok: true });
  assert.deepEqual(actions.startMatch(seats), { ok: true });
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
});

test('once the night is over, startMatch, recordGame and undo refuse with noNight', () => {
  const { actions, outbox } = setup(nightWithMatch(['A']), NEXT_NOON);
  assert.deepEqual(actions.startMatch(seats), { ok: false, error: 'noNight' });
  assert.deepEqual(actions.recordGame('A'), { ok: false, error: 'noNight' });
  assert.deepEqual(actions.undo(), { ok: false, error: 'noNight' });
  assert.deepEqual(outbox.queue, []);
});

test('startNight refuses while a night is ongoing, and works once it is over', () => {
  const ongoing = setup(nightWithMatch(), fixedClock('2026-10-15', 11));
  assert.deepEqual(ongoing.actions.startNight(FOUR), { ok: false, error: 'nightOngoing' });
  assert.deepEqual(ongoing.outbox.queue, []);
  const over = setup(nightWithMatch(), NEXT_NOON);
  assert.deepEqual(over.actions.startNight(FOUR), { ok: true });
  assert.deepEqual(queued(over.outbox), ['startNight 2026-10-15']);
});

test('an empty match whose startMatch was sent is deleted and its number not reused', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  outbox.markSent(outbox.queue[0]);
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${MATCH_1}`, `deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});

test('a number whose deleteMatch is still queued is not reused', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  outbox.markSent(outbox.queue[0]);
  actions.undo();
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${MATCH_1}`, `deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});

test('renamePlayer validates locally and enqueues the stored name and the trimmed new name', () => {
  const { actions, outbox, store } = setup(nightWithMatch(['A']));
  assert.deepEqual(actions.renamePlayer('Nobody', 'Kari'), { ok: false, error: 'unknownPlayer' });
  assert.deepEqual(actions.renamePlayer('Hans', 'per'), { ok: false, error: 'duplicate' });
  assert.deepEqual(actions.renamePlayer('Hans', 'Jo+hannes'), { ok: false, error: 'plus' });
  assert.deepEqual(actions.renamePlayer('Hans', 'Hans'), { ok: true });
  assert.deepEqual(outbox.queue, []);
  assert.deepEqual(actions.renamePlayer('hans', ' Johannes '), { ok: true });
  assert.deepEqual(outbox.queue.map((op) => op.payload), [{ from: 'Hans', to: 'Johannes' }]);
  assert.equal(store.get().matches[0].A1, 'Johannes');
});

test('renamePlayer allows a new casing of the same name', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.renamePlayer('Hans', 'HANS'), { ok: true });
  assert.deepEqual(outbox.queue.map((op) => op.payload), [{ from: 'Hans', to: 'HANS' }]);
});

test('setPlayerActive enqueues only real changes', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  assert.deepEqual(actions.setPlayerActive('Nobody', false), { ok: false, error: 'unknownPlayer' });
  assert.deepEqual(actions.setPlayerActive('Hans', true), { ok: true });
  assert.deepEqual(outbox.queue, []);
  assert.deepEqual(actions.setPlayerActive('Hans', false), { ok: true });
  assert.deepEqual(outbox.queue.map((op) => [op.action, op.payload]), [['setPlayerActive', { name: 'Hans', active: false }]]);
  assert.equal(store.get().players.find((p) => p.name === 'Hans').active, false);
});

test('joinNight adds an existing player to the active night under the stored name', () => {
  const base = nightWithMatch();
  const { actions, outbox, store } = setup({ ...base, players: [...base.players, { name: 'Kari', active: true }] });
  assert.deepEqual(actions.joinNight('Nobody'), { ok: false, error: 'unknownPlayer' });
  assert.deepEqual(actions.joinNight('kari'), { ok: true });
  assert.deepEqual(actions.joinNight('Kari'), { ok: true }, 'already here: nothing to do');
  assert.deepEqual(outbox.queue.map((op) => [op.action, op.payload]), [['joinNight', { date: DATE, name: 'Kari' }]]);
  assert.deepEqual(store.get().nights[0].players, [...FOUR, 'Kari']);
});

test('leaveNight marks a player on the roster as gone home; joinNight brings them back', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  assert.deepEqual(actions.leaveNight('Nobody'), { ok: false, error: 'unknownPlayer' });
  assert.deepEqual(actions.leaveNight('per'), { ok: true });
  assert.deepEqual(store.get().nights[0].left, ['Per']);
  assert.deepEqual(actions.joinNight('Per'), { ok: true });
  assert.deepEqual(store.get().nights[0].left, []);
  assert.deepEqual(queued(outbox), ['leaveNight Per', 'joinNight Per']);
});

test('addPlayerToNight creates a new player and puts them on the roster', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  assert.deepEqual(actions.addPlayerToNight('hans'), { ok: false, error: 'duplicate' });
  assert.deepEqual(actions.addPlayerToNight('A, B'), { ok: false, error: 'comma' });
  assert.deepEqual(actions.addPlayerToNight(' Kari '), { ok: true });
  assert.deepEqual(queued(outbox), ['addPlayer Kari', 'joinNight Kari']);
  assert.deepEqual(store.get().nights[0].players, [...FOUR, 'Kari']);
});

test('roster changes need an active night', () => {
  const { actions, outbox } = setup(nightWithMatch(), NEXT_NOON);
  assert.deepEqual(actions.joinNight('Hans'), { ok: false, error: 'noNight' });
  assert.deepEqual(actions.leaveNight('Hans'), { ok: false, error: 'noNight' });
  assert.deepEqual(actions.addPlayerToNight('Kari'), { ok: false, error: 'noNight' });
  assert.deepEqual(outbox.queue, []);
});

test('deletePlayer refuses players with history and removes the others', () => {
  const base = nightWithMatch();
  const { actions, outbox, store } = setup({ ...base, players: [...base.players, { name: 'Kari', active: true }] });
  assert.deepEqual(actions.deletePlayer('Nobody'), { ok: false, error: 'unknownPlayer' });
  assert.deepEqual(actions.deletePlayer('Hans'), { ok: false, error: 'inUse' });
  assert.deepEqual(outbox.queue, []);
  assert.deepEqual(actions.deletePlayer('kari'), { ok: true });
  assert.deepEqual(queued(outbox), ['deletePlayer Kari']);
  assert.equal(store.get().players.length, 4);
});

/** A store on nightWithMatch plus a scripted api for the one-shot sendNightSummary: replies in order, calls recorded. */
function mailSetup(replies, { online = true, pin = '1234', newPin = null } = {}) {
  const storage = createStorage(memoryBackend());
  storage.set('dataset', nightWithMatch());
  storage.set('pin', pin);
  const outbox = fakeOutbox();
  const refreshes = [];
  const store = createStore({ storage, outbox, api: { getAll: async () => { refreshes.push(true); return { ok: false }; } } });
  const calls = [];
  const api = {
    post: async (action, payload, sentPin) => {
      calls.push({ action, payload, pin: sentPin });
      return replies.shift();
    },
  };
  const asked = [];
  const actions = createActions({
    store, outbox, clock: NEXT_NOON, api,
    pin: () => storage.get('pin', ''),
    online: () => online,
    askPin: async () => {
      asked.push(true);
      if (newPin) storage.set('pin', newPin);
    },
  });
  return { actions, calls, asked, outbox, refreshes };
}
const MAIL = { subject: 'S', text: 'T', html: '<p>T</p>' };
const SENT = (recipients) => ({ ok: true, result: 'applied', data: { recipients } });

test('sendNightSummary posts once, straight to the api (not the outbox), and reports the recipient count', async () => {
  const { actions, calls, outbox } = mailSetup([SENT(5)]);
  assert.deepEqual(await actions.sendNightSummary(DATE, MAIL), { ok: true, recipients: 5 });
  assert.deepEqual(calls, [{ action: 'sendNightSummary', payload: { date: DATE, subject: 'S', text: 'T', html: '<p>T</p>' }, pin: '1234' }]);
  assert.deepEqual(outbox.queue, []);
});

test('sendNightSummary with a test player sends the name along (the server mails only them)', async () => {
  const { actions, calls } = mailSetup([SENT(1)]);
  assert.deepEqual(await actions.sendNightSummary(DATE, MAIL, { testPlayer: 'Fredrik' }), { ok: true, recipients: 1 });
  assert.deepEqual(calls[0].payload, { date: DATE, subject: 'S', text: 'T', html: '<p>T</p>', testPlayer: 'Fredrik' });
});

test('sendNightSummary: after a real send the store refreshes (the night now shows summarySent); not after a test', async () => {
  const sent = mailSetup([SENT(5)]);
  await sent.actions.sendNightSummary(DATE, MAIL);
  assert.equal(sent.refreshes.length, 1);
  const tested = mailSetup([SENT(1)]);
  await tested.actions.sendNightSummary(DATE, MAIL, { testPlayer: 'Fredrik' });
  assert.equal(tested.refreshes.length, 0);
});

test('sendNightSummary works after the night is over, but needs a known night', async () => {
  const { actions, calls } = mailSetup([]);
  assert.deepEqual(await actions.sendNightSummary('2026-10-13', MAIL), { ok: false, error: 'invalid' });
  assert.deepEqual(calls, []);
});

test('sendNightSummary offline: nothing sent or queued, the user tries again later', async () => {
  const { actions, calls, outbox } = mailSetup([], { online: false });
  assert.deepEqual(await actions.sendNightSummary(DATE, MAIL), { ok: false, error: 'offline' });
  assert.deepEqual(calls, []);
  assert.deepEqual(outbox.queue, []);
});

test('sendNightSummary maps server errors to t.errors keys', async () => {
  const cases = [
    [{ ok: false, error: 'network' }, 'network'],
    [{ ok: false, error: 'invalid', message: 'No recipients' }, 'noRecipients'],
    [{ ok: false, error: 'quota', message: 'Daily email quota used up' }, 'mailQuota'],
    [{ ok: false, error: 'invalid', message: 'Test player has no email' }, 'noTestRecipient'],
    [{ ok: false, error: 'conflict', message: 'Summary already sent' }, 'summaryAlreadySent'],
    [{ ok: false, error: 'quota', message: 'Daily send limit reached' }, 'summaryDailyLimit'],
    [{ ok: false, error: 'invalid', message: 'Unknown night' }, 'sendFailed'],
    [{ ok: false, error: 'busy' }, 'sendFailed'],
    [{ ok: false, error: 'server', message: 'boom' }, 'sendFailed'],
  ];
  for (const [reply, error] of cases) {
    const { actions } = mailSetup([reply]);
    assert.deepEqual(await actions.sendNightSummary(DATE, MAIL), { ok: false, error }, JSON.stringify(reply));
  }
});

test('sendNightSummary with a wrong PIN asks for it and retries once with the new one', async () => {
  const { actions, calls, asked } = mailSetup([{ ok: false, error: 'pin' }, SENT(3)], { newPin: '9999' });
  assert.deepEqual(await actions.sendNightSummary(DATE, MAIL), { ok: true, recipients: 3 });
  assert.equal(asked.length, 1);
  assert.deepEqual(calls.map((c) => c.pin), ['1234', '9999']);
});

test('sendNightSummary: a cancelled PIN prompt sends nothing more', async () => {
  const { actions, calls } = mailSetup([{ ok: false, error: 'pin' }]);
  assert.deepEqual(await actions.sendNightSummary(DATE, MAIL), { ok: false, error: 'pin' });
  assert.equal(calls.length, 1);
});
