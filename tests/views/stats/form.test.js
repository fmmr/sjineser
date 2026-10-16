import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formLabel, formLetters } from '../../../docs/js/views/stats/widgets/form.js';

test('form letters: S/U/T per game, oldest first', () => {
  assert.deepEqual(formLetters(['W', 'D', 'L']), ['S', 'U', 'T']);
  assert.deepEqual(formLetters([]), []);
});

test('form label: counts of the last games, singular and plural', () => {
  const ten = ['W', 'W', 'D', 'L', 'W', 'D', 'L', 'W', 'D', 'L'];
  assert.equal(formLabel(ten), 'Siste 10: 4 seire, 3 uavgjort, 3 tap');
  assert.equal(formLabel(['W', 'L']), 'Siste 2: 1 seier, 0 uavgjort, 1 tap');
});
