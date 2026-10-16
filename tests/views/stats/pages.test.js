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
  assert.deepEqual(sideBySide.map((s) => s.id), ['drawRate', 'rating', 'gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'decisiveWinRate', 'nightsAttended']);
  assert.deepEqual(overlay.map((s) => s.id), ['eloChart']);
  assert.deepEqual(headToHead.map((s) => s.id), ['togetherWdl', 'headToHead', 'pairChemistry']);
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

test('overview: leaderboard, summary, records, attendance (the nights table lives on the Kvelder tab)', () => {
  assert.deepEqual(PAGES.overview.sections.map((s) => s.id), ['leaderboard', 'summary', 'records', 'seasonPlayers', 'decisive']);
});

test('list pages: Spillere is the leaderboard of everyone who has played, Kvelder the nights table', () => {
  assert.deepEqual(PAGES.players.sections, [{ id: 'leaderboard', stats: ['leaderboard'] }]);
  assert.deepEqual(PAGES.nights.sections, [{ id: 'nights', stats: ['nightsList'] }]);
  assert.equal(PAGE_SUBJECTS.players, 'overall');
  assert.equal(PAGE_SUBJECTS.nights, 'overall');
});

test('pairs page: one table, kjemi is a column in it', () => {
  assert.deepEqual(PAGES.pairs.sections, [{ id: 'pairs', stats: ['pairsTable'] }]);
});

test('player page: Form gets its own section right under Rating', () => {
  assert.deepEqual(PAGES.player.sections.map((s) => s.id), ['rating', 'form', 'results', 'streaks', 'people']);
  assert.deepEqual(PAGES.player.sections.find((s) => s.id === 'form').stats, ['form']);
  assert.equal(tileTitleHidden({ id: 'form', stats: ['form'] }), true);
});

test('player page: people records first (best/worst partner, nemesis/favourite victim), then the tables', () => {
  assert.deepEqual(PAGES.player.sections.find((s) => s.id === 'people').stats,
    ['bestPartner', 'worstPartner', 'nemesis', 'favoriteVictim', 'partners', 'opponents']);
});

test('rating extremes: overview records end with highest/lowest; player peak/low sit next to the rating tile', () => {
  assert.deepEqual(PAGES.overview.sections.find((s) => s.id === 'records').stats.slice(-3),
    ['biggestUpset', 'highestRating', 'lowestRating']);
  assert.deepEqual(PAGES.player.sections.find((s) => s.id === 'rating').stats.slice(0, 4),
    ['rating', 'eloChart', 'peakRating', 'lowRating']);
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

test('night page: sets, the night\'s leaderboard (winner first), its pairs, summary, records', () => {
  assert.deepEqual(PAGES.night.sections.map((s) => s.id), ['sets', 'nightLeaderboard', 'nightPairs', 'decisive', 'summary', 'records']);
  assert.deepEqual(PAGES.night.sections.find((s) => s.id === 'nightLeaderboard').stats, ['nightWinner', 'nightLeaderboard']);
  assert.deepEqual(PAGES.night.sections.find((s) => s.id === 'nightPairs').stats, ['pairsTable']);
  assert.equal(PAGE_SUBJECTS.night, 'overall');
});

test('avgjørende spill: a table on the overview and night pages, the win share after Seier i sett', () => {
  for (const page of [PAGES.overview, PAGES.night]) {
    assert.deepEqual(page.sections.find((s) => s.id === 'decisive').stats, ['decisiveTable']);
  }
  const results = PAGES.player.sections.find((s) => s.id === 'results').stats;
  assert.equal(results[results.indexOf('matchWinRate') + 1], 'decisiveWinRate');
  assert.equal(tileTitleHidden({ id: 'decisive', stats: ['decisiveTable'] }), true);
});

test('sesongens spiller: an overview table after the records; season titles after peak/low on the player page', () => {
  assert.deepEqual(PAGES.overview.sections.find((s) => s.id === 'seasonPlayers').stats, ['seasonPlayers']);
  assert.deepEqual(PAGES.player.sections.find((s) => s.id === 'rating').stats,
    ['rating', 'eloChart', 'peakRating', 'lowRating', 'seasonTitles']);
  assert.equal(tileTitleHidden({ id: 'seasonPlayers', stats: ['seasonPlayers'] }), true);
});

test('night page: no stat with a minimum of games or that skips provisional games (one night is too short)', () => {
  const ids = PAGES.night.sections.flatMap((s) => s.stats);
  for (const id of ['bestPartner', 'worstPartner', 'nemesis', 'favoriteVictim', 'chemistry', 'pairChemistry',
    'highestRating', 'lowestRating', 'peakRating', 'lowRating']) {
    assert.ok(!ids.includes(id), id);
  }
});
