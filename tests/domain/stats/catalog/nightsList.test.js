import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';

// N1: Kari sits out; Frode & Hans win 3–0. N2: Kari plays with Hans; a second set was started
// without games (not a set). N3: nobody played (not listed).
const FACTS = factsOf([
  { date: N1, players: ['Kari'], matches: [[HF_TP, 'AAA']] },
  { date: N2, matches: [['Kari Hans - Tor Per', 'ADB'], ['Kari Per - Hans Tor', '']] },
  { date: N3, players: ['Ola'], matches: [] },
]);

/** A player's total rating change on a date, straight from the facts rows. */
const gainOf = (facts, name, date) => facts.rows
  .filter((r) => r.player === name && r.date === date).reduce((sum, r) => sum + r.delta, 0);

test('nightsList: one row per played night, newest first, with roster, sets, games, draws and winner', () => {
  const value = compute('nightsList', FACTS, overallSubject());
  assert.deepEqual(value.columns.map((c) => [c.key, c.format]), [
    ['date', 'date'], ['players', 'players'], ['sets', 'int'], ['games', 'int'], ['draws', 'int'],
    ['winner', 'player'], ['winnerGain', 'signed'],
  ]);
  assert.deepEqual(value.rows.map(({ date, players, sets, games, draws, winner }) => [date, players, sets, games, draws, winner]), [
    [N2, ['Hans', 'Kari', 'Per', 'Tor'], 1, 3, 1, 'Per'],
    [N1, ['Frode', 'Hans', 'Kari', 'Per', 'Tor'], 1, 3, 0, 'Frode'],
  ]);
  assert.equal(value.rows[0].winnerGain, gainOf(FACTS, 'Per', N2));
  assert.ok(value.rows[0].winnerGain > gainOf(FACTS, 'Hans', N2));
  assert.equal(value.rows[1].winnerGain, gainOf(FACTS, 'Hans', N1), 'Frode and Hans tie; Frode by name');
  assert.ok(value.rows.every((r) => r.subject === undefined), 'no night page yet');
});

test('nightsList: names in Norwegian order; null without played nights', () => {
  const names = factsOf([{ date: N1, matches: [['Åse Øyvind - Bjørn Ærlig', 'A']] }]);
  assert.deepEqual(compute('nightsList', names, overallSubject()).rows[0].players, ['Bjørn', 'Ærlig', 'Øyvind', 'Åse']);
  assert.equal(compute('nightsList', factsOf([{ date: N3, players: ['Ola'], matches: [] }]), overallSubject()), null);
});
