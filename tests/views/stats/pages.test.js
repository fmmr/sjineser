import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withValues,
  COMPARE_SECTIONS, PAGES, PAGE_SUBJECTS, deriveCompare, overlaySeries, sideBySideRows, tileTitleHidden,
} from '../../../docs/js/views/stats/pages.js';
import { STATS, statById } from '../../../docs/js/domain/stats/registry.js';
import { t } from '../../../docs/js/i18n/nb.js';

test('every page lists registered stats that support its subject type', () => {
  for (const [pageId, page] of Object.entries(PAGES)) {
    const type = PAGE_SUBJECTS[pageId];
    for (const section of page.sections) {
      for (const id of section.stats) {
        assert.ok(statById(id), `${pageId}: unknown stat ${id}`);
        assert.ok(statById(id).subjects.includes(type), `${pageId}: ${id} does not support ${type}`);
      }
    }
  }
});

test('every section has a heading', () => {
  const ids = [...Object.values(PAGES).flatMap((p) => p.sections.map((s) => s.id)), ...Object.values(COMPARE_SECTIONS)];
  for (const id of ids) assert.equal(typeof t.statsSections[id], 'string', id);
});

test('compare derives from the catalog: player numbers/wdl side by side, player charts overlaid, compare stats', () => {
  const { sideBySide, overlay, headToHead } = deriveCompare(STATS);
  assert.deepEqual(sideBySide.map((s) => s.id), ['drawRate', 'rating', 'gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate']);
  assert.deepEqual(overlay.map((s) => s.id), ['eloChart']);
  assert.deepEqual(headToHead.map((s) => s.id), ['togetherWdl', 'headToHead']);
});

test('a new stat shows up in compare without editing pages', () => {
  const fake = [
    { id: 'n', subjects: ['player'], kind: 'number' },
    { id: 'w', subjects: ['pair', 'player'], kind: 'wdl' },
    { id: 'tbl', subjects: ['player'], kind: 'table' },
    { id: 'rec', subjects: ['player'], kind: 'record' },
    { id: 'c', subjects: ['player'], kind: 'chart' },
    { id: 'overallOnly', subjects: ['overall'], kind: 'number' },
    { id: 'h2h', subjects: ['compare'], kind: 'table' },
  ];
  const { sideBySide, overlay, headToHead } = deriveCompare(fake);
  assert.deepEqual(sideBySide.map((s) => s.id), ['n', 'w']);
  assert.deepEqual(overlay.map((s) => s.id), ['c']);
  assert.deepEqual(headToHead.map((s) => s.id), ['h2h']);
});

test('side-by-side rows leave out stats with no data on both sides', () => {
  const stats = [{ id: 'both' }, { id: 'onlyA' }, { id: 'onlyB' }, { id: 'none' }];
  const values = { both: [1, 2], onlyA: [3, null], onlyB: [null, 4], none: [null, null] };
  const rows = sideBySideRows(stats, (stat, side) => values[stat.id][side === 'a' ? 0 : 1]);
  assert.deepEqual(rows.map((r) => [r.stat.id, r.a, r.b]), [['both', 1, 2], ['onlyA', 3, null], ['onlyB', null, 4]]);
});

test('overlay merges both players series with team colours; missing sides are skipped', () => {
  const a = { series: [{ name: 'Anne', points: [{ x: '2026-07-01', y: 1010 }] }] };
  const b = { series: [{ name: 'Bjørn', points: [{ x: '2026-07-08', y: 990 }] }] };
  assert.deepEqual(overlaySeries([a, b]), { value: { series: [...a.series, ...b.series] }, tones: ['team-a', 'team-b'] });
  assert.deepEqual(overlaySeries([null, b]), { value: { series: b.series }, tones: ['team-b'] });
  assert.equal(overlaySeries([null, null]), null);
});

test('every registered stat is shown somewhere: on a page or in the derived compare page', () => {
  const { sideBySide, overlay, headToHead } = deriveCompare(STATS);
  const shown = new Set([
    ...Object.values(PAGES).flatMap((page) => page.sections.flatMap((section) => section.stats)),
    ...[...sideBySide, ...overlay, ...headToHead].map((s) => s.id),
  ]);
  for (const { id } of STATS) assert.ok(shown.has(id), `${id} is registered but on no page (add it to PAGES in views/stats/pages.js)`);
});

test('a lone stat titled like its section hides its tile title; otherwise titles show', () => {
  assert.equal(tileTitleHidden({ id: 'leaderboard', stats: ['leaderboard'] }), true);
  assert.equal(tileTitleHidden({ id: 'streaks', stats: ['streaks'] }), true);
  assert.equal(tileTitleHidden({ id: 'pairs', stats: ['pairsTable'] }), false);
  assert.equal(tileTitleHidden({ id: 'rating', stats: ['rating', 'eloChart'] }), false);
});

test('withValues keeps only stats with a value, in page order', () => {
  const stat = (id, value) => ({ id, compute: () => value });
  const result = withValues([stat('a', { value: 1 }), stat('b', null), stat('c', { value: 3 })], {}, {});
  assert.deepEqual(result.map(({ stat: { id }, value }) => [id, value.value]), [['a', 1], ['c', 3]]);
  assert.deepEqual(withValues([stat('b', null)], {}, {}), []);
});
