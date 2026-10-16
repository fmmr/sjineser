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

test('leaderboard oppmøte column: nights on the roster (sitting out counts) and share of played nights', () => {
  const value = compute('leaderboard', FACTS, overallSubject());
  assert.ok(value.columns.some((c) => c.key === 'attendance' && c.format === 'countShare'));
  const byPlayer = Object.fromEntries(value.rows.map((r) => [r.player, r.attendance]));
  assert.deepEqual(byPlayer.Hans, { count: 3, share: 1 });
  assert.deepEqual(byPlayer.Kari, { count: 2, share: 2 / 3 });
  assert.equal(byPlayer.Ola, undefined, 'never played: not listed');
});

test('leaderboard oppmøte column: 0 for a period the player missed', () => {
  const autumn = factsOf([
    { date: '2026-03-04', players: ['Kari'], matches: [['Kari Hans - Tor Per', 'A']] },
    { date: N1, matches: [[HF_TP, 'AAA']] },
  ], { kind: 'season', year: 2026, half: 2 });
  const kari = compute('leaderboard', autumn, overallSubject()).rows.find((r) => r.player === 'Kari');
  assert.deepEqual(kari.attendance, { count: 0, share: 0 });
});

test('the night leaderboard has no oppmøte column (one night is always one night)', () => {
  const night = factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }], { kind: 'night', date: N1 });
  assert.equal(compute('nightLeaderboard', night, overallSubject()).columns.some((c) => c.key === 'attendance'), false);
});

test('nightsAttended: played nights the player was there; null for someone who never came', () => {
  assert.deepEqual(compute('nightsAttended', FACTS, playerSubject('Kari')), { value: 2, format: 'int' });
  assert.deepEqual(compute('nightsAttended', FACTS, playerSubject('Hans')), { value: 3, format: 'int' });
  assert.equal(compute('nightsAttended', FACTS, playerSubject('Ola')), null);
});
