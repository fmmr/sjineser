import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';

// Three played nights; Kari sits out on N2 (on the roster, not seated); N3 has no games, so it
// does not count; Ola was there only on N3.
const FACTS = factsOf([
  { date: N1, matches: [[HF_TP, 'AAA']] },
  { date: N2, players: ['Kari'], matches: [[HF_TP, 'BBB']] },
  { date: '2026-09-23', players: ['Kari'], matches: [['Kari Hans - Tor Per', 'A']] },
  { date: N3, players: ['Ola'], matches: [] },
]);

test('attendance: nights on the roster (sitting out counts), share of played nights, most first', () => {
  const value = compute('attendance', FACTS, overallSubject());
  assert.deepEqual(value.columns.map((c) => [c.key, c.format]),
    [['player', 'player'], ['nights', 'int'], ['share', 'percent']]);
  assert.deepEqual(value.rows.map((r) => [r.player, r.nights, r.share]), [
    ['Hans', 3, 1], ['Per', 3, 1], ['Tor', 3, 1], ['Frode', 2, 2 / 3], ['Kari', 2, 2 / 3],
  ]);
  assert.deepEqual(value.rows[0].subject, playerSubject('Hans'));
});

test('attendance: everyone who has ever played is listed, with 0 for nights missed in the period', () => {
  const autumn = factsOf([
    { date: '2026-03-04', players: ['Kari'], matches: [['Kari Hans - Tor Per', 'A']] },
    { date: N1, matches: [[HF_TP, 'AAA']] },
  ], { kind: 'season', year: 2026, half: 2 });
  const kari = compute('attendance', autumn, overallSubject()).rows.find((r) => r.player === 'Kari');
  assert.deepEqual([kari.nights, kari.share], [0, 0]);
  assert.equal(compute('attendance', FACTS, overallSubject()).rows.some((r) => r.player === 'Ola'), false, 'never played');
});

test('attendance: null without played nights', () => {
  assert.equal(compute('attendance', factsOf([{ date: N3, players: ['Ola'], matches: [] }]), overallSubject()), null);
});

test('nightsAttended: played nights the player was there; null for someone who never came', () => {
  assert.deepEqual(compute('nightsAttended', FACTS, playerSubject('Kari')), { value: 2, format: 'int' });
  assert.deepEqual(compute('nightsAttended', FACTS, playerSubject('Hans')), { value: 3, format: 'int' });
  assert.equal(compute('nightsAttended', FACTS, playerSubject('Ola')), null);
});
