import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonOptions } from '../../../docs/js/views/stats/season-filter.js';
import { t } from '../../../docs/js/i18n/nb.js';
import { dataset } from '../../helpers.js';

test('season labels: half 1 is spring, half 2 is autumn', () => {
  assert.equal(t.statsUi.season({ year: 2026, half: 1 }), 'Vår 2026');
  assert.equal(t.statsUi.season({ year: 2026, half: 2 }), 'Høst 2026');
});

test('options: this season first, earlier seasons newest first, then all seasons', () => {
  const data = dataset({ nights: [{ date: '2025-09-01', players: [] }, { date: '2026-03-01', players: [] }] });
  assert.deepEqual(seasonOptions(data, '2026-10-14'), [
    { value: '2026-2', label: 'Denne sesongen' },
    { value: '2026-1', label: 'Vår 2026' },
    { value: '2025-2', label: 'Høst 2025' },
    { value: 'all', label: 'Alle sesonger' },
  ]);
});

test('options without any nights: this season and all seasons', () => {
  assert.deepEqual(seasonOptions(dataset(), '2026-03-01').map((o) => o.value), ['2026-1', 'all']);
});
