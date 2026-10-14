import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapFocus } from '../../../docs/js/views/components/sheet.js';

test('wrapFocus wraps Tab from the last element to the first', () => {
  assert.equal(wrapFocus(2, 3, false), 0);
  assert.equal(wrapFocus(0, 3, true), 2);
});

test('wrapFocus leaves Tab alone inside the ring', () => {
  assert.equal(wrapFocus(0, 3, false), null);
  assert.equal(wrapFocus(1, 3, true), null);
  assert.equal(wrapFocus(1, 3, false), null);
});

test('wrapFocus pulls focus back in from outside the sheet', () => {
  assert.equal(wrapFocus(-1, 3, false), 0);
  assert.equal(wrapFocus(-1, 3, true), 2);
});

test('wrapFocus with one or no focusable element keeps focus put', () => {
  assert.equal(wrapFocus(0, 1, false), 0);
  assert.equal(wrapFocus(0, 1, true), 0);
  assert.equal(wrapFocus(-1, 0, false), null);
});
