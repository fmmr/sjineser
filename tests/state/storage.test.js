import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../docs/js/state/storage.js';
import { memoryBackend } from '../helpers.js';

test('storage round-trips JSON under a prefix and falls back on missing or corrupt values', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  storage.set('outbox', [{ id: 1 }]);
  assert.deepEqual(storage.get('outbox', []), [{ id: 1 }]);
  assert.equal(backend.getItem('sjineser:outbox'), '[{"id":1}]');
  assert.equal(storage.get('missing', 'fallback'), 'fallback');
  backend.setItem('sjineser:broken', '{nope');
  assert.equal(storage.get('broken', null), null);
});
