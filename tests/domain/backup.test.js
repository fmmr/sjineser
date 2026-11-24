import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupCounts, backupFileName, parseBackup } from '../../docs/js/domain/backup.js';

const BACKUP = { format: 'sjineser-backup', version: 1, players: [{}, {}], nights: [{}], matches: [], games: [{}, {}, {}] };

test('parseBackup accepts a Sjineser backup and nothing else', () => {
  assert.deepEqual(parseBackup(JSON.stringify(BACKUP)), BACKUP);
  for (const bad of ['', 'ikke json', 'null', '42', '[]', '{}',
    JSON.stringify({ ...BACKUP, format: 'other' }),
    JSON.stringify({ ...BACKUP, version: 2 }),
    JSON.stringify({ ...BACKUP, games: 'x' }),
    JSON.stringify({ format: BACKUP.format, version: 1, players: [] })]) {
    assert.equal(parseBackup(bad), null, bad);
  }
});

test('backupCounts', () => {
  assert.deepEqual(backupCounts(BACKUP), { players: 2, nights: 1, matches: 0, games: 3 });
});

test('backupFileName: safe lowercase name with the date', () => {
  assert.equal(backupFileName('Jaktlaget', '2026-11-24'), 'sjineser-jaktlaget-2026-11-24.json');
  assert.equal(backupFileName('Familie-kineser å/ø', '2026-11-24'), 'sjineser-familie-kineser-a-o-2026-11-24.json');
  assert.equal(backupFileName('!!!', '2026-11-24'), 'sjineser-liga-2026-11-24.json');
  assert.equal(backupFileName('Ærlige Åse', '2026-11-24'), 'sjineser-aerlige-ase-2026-11-24.json');
});
