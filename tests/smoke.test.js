import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend } from './helpers.js';

test('memory backend stores strings', () => {
  const backend = memoryBackend();
  backend.setItem('k', 1);
  assert.equal(backend.getItem('k'), '1');
  assert.equal(backend.getItem('missing'), null);
});
