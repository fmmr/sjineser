import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonNames } from '../../../docs/js/views/stats/widgets/record.js';

test('seasonNames: seasons by name, in the given order', () => {
  assert.equal(seasonNames([{ year: 2026, half: 1 }]), 'Vår 2026');
  assert.equal(seasonNames([{ year: 2026, half: 2 }, { year: 2026, half: 1 }, { year: 2025, half: 2 }]), 'Høst 2026, Vår 2026 og Høst 2025');
});
