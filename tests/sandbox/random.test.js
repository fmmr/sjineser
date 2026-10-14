import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../../docs/js/sandbox/random.js';

const sequence = (seed, length = 10) => {
  const random = createRandom(seed);
  return Array.from({ length }, () => random.next());
};

test('the same seed gives the same sequence; different seeds differ', () => {
  assert.deepEqual(sequence(42), sequence(42));
  assert.notDeepEqual(sequence(42), sequence(43));
});

test('next() stays in [0, 1)', () => {
  for (const value of sequence(7, 1000)) assert.ok(value >= 0 && value < 1, `${value}`);
});

test('int() covers both bounds inclusively and nothing outside', () => {
  const random = createRandom(1);
  const seen = new Set(Array.from({ length: 1000 }, () => random.int(2, 5)));
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('pick() returns an element, chance() a boolean, shuffle() a permutation copy', () => {
  const random = createRandom(3);
  const items = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 50; i += 1) assert.ok(items.includes(random.pick(items)));
  assert.equal(typeof random.chance(0.5), 'boolean');
  assert.equal(random.chance(0), false);
  assert.equal(random.chance(1), true);
  const shuffled = random.shuffle(items);
  assert.notEqual(shuffled, items);
  assert.deepEqual([...shuffled].sort(), items);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});
