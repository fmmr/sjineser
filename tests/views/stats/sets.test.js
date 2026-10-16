import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setStatus } from '../../../docs/js/views/stats/widgets/sets.js';

const done = { complete: true };
const open = { complete: false };

test('setStatus: a finished set has no marker', () => {
  assert.equal(setStatus(done, true, true), null);
  assert.equal(setStatus(done, false, false), null);
});

test('setStatus: the last unfinished set of an ongoing night is "pågår"', () => {
  assert.equal(setStatus(open, true, true), 'ongoing');
});

test('setStatus: an abandoned set, or any unfinished set once the night is over, is "ikke ferdig"', () => {
  assert.equal(setStatus(open, false, true), 'unfinished');
  assert.equal(setStatus(open, true, false), 'unfinished');
});
