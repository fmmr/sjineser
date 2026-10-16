import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HT_FP, compute, factsOf } from './fixtures.js';

const OVERALL = overallSubject();

test('headToHeadMatrix: every player, Norwegian order; row vs column results; null on the diagonal and where they never met', () => {
  // Hans & Frode beat Tor & Per twice and draw once; Hans & Tor lose to Frode & Per once (Tor's only game against Per).
  // Ola (team of three) beats Tor & Per once alongside Hans & Frode; Ola never meets Hans or Frode.
  const facts = factsOf([{ date: '2026-10-13', matches: [[HF_TP, 'AAD'], [HT_FP, 'B'], ['Hans Frode Ola - Tor Per', 'A']] }]);
  const value = compute('headToHeadMatrix', facts, OVERALL);
  assert.deepEqual(value.players, ['Frode', 'Hans', 'Ola', 'Per', 'Tor']);
  const cell = (a, b) => value.cells[value.players.indexOf(a)][value.players.indexOf(b)];
  assert.deepEqual(cell('Hans', 'Tor'), { W: 3, D: 1, L: 0 });
  assert.deepEqual(cell('Tor', 'Hans'), { W: 0, D: 1, L: 3 });
  assert.deepEqual(cell('Hans', 'Per'), { W: 3, D: 1, L: 1 });
  assert.deepEqual(cell('Frode', 'Hans'), { W: 1, D: 0, L: 0 });
  assert.deepEqual(cell('Ola', 'Per'), { W: 1, D: 0, L: 0 });
  assert.deepEqual(cell('Tor', 'Per'), { W: 0, D: 0, L: 1 });
  assert.equal(cell('Ola', 'Hans'), null, 'only teammates');
  assert.equal(cell('Frode', 'Ola'), null, 'only teammates');
  value.players.forEach((name, i) => assert.equal(value.cells[i][i], null, name));
});

test('headToHeadMatrix: the period filter applies; null with fewer than two players', () => {
  const facts = factsOf([
    { date: '2025-10-01', matches: [['Hans Ola - Tor Per', 'A']] },
    { date: '2026-03-04', matches: [[HF_TP, 'B']] },
  ], { kind: 'season', year: 2026, half: 1 });
  const value = compute('headToHeadMatrix', facts, OVERALL);
  assert.deepEqual(value.players, ['Frode', 'Hans', 'Per', 'Tor']);
  assert.deepEqual(value.cells[1][3], { W: 0, D: 0, L: 1 });
  assert.equal(compute('headToHeadMatrix', factsOf([]), OVERALL), null);
});
