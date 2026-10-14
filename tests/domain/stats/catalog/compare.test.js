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

test('againstWdl: games against each other, from the first player’s perspective', () => {
  assert.deepEqual(compute('againstWdl', FACTS, compareSubject('Per', 'Hans')), { W: 3, D: 2, L: 5 });
  assert.deepEqual(compute('againstWdl', FACTS, compareSubject('Hans', 'Ola')), { W: 0, D: 2, L: 3 });
  assert.equal(compute('againstWdl', FACTS, compareSubject('Hans', 'Frode')), null);
});
