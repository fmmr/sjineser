import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const FACTS = factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], ['Frode Hans - Ola Per', 'DBDBB'], ['Tor Per - Hans Frode', 'BB']] }]);

test('togetherWdl: games as partners', () => {
  assert.deepEqual(compute('togetherWdl', FACTS, compareSubject('Hans', 'Frode')), { W: 5, D: 2, L: 3 });
  assert.equal(compute('togetherWdl', FACTS, compareSubject('Hans', 'Ola')), null);
});

test('headToHead: each player’s wins against the other, plus draws', () => {
  assert.deepEqual(compute('headToHead', FACTS, compareSubject('Per', 'Hans')), { left: { name: 'Per', wins: 3 }, right: { name: 'Hans', wins: 5 }, draws: 2 });
  assert.deepEqual(compute('headToHead', FACTS, compareSubject('Hans', 'Ola')), { left: { name: 'Hans', wins: 0 }, right: { name: 'Ola', wins: 3 }, draws: 2 });
  assert.equal(compute('headToHead', FACTS, compareSubject('Hans', 'Frode')), null);
});
