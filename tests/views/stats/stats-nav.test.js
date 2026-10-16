import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS_TABS, breadcrumbParts, statsTab, statsTabs } from '../../../docs/js/views/stats/stats-nav.js';

test('statsTab: the overview, the list pages and the detail pages under them', () => {
  const cases = {
    '/stats': 'overview',
    '/stats/players': 'players',
    '/stats/player': 'players',
    '/stats/player/Anne': 'players',
    '/stats/compare/Anne/Bj%C3%B8rn': 'players',
    '/stats/pairs': 'pairs',
    '/stats/pair/Anne+Bj%C3%B8rn': 'pairs',
    '/stats/nights': 'nights',
    '/stats/night/2026-10-13': 'nights',
  };
  for (const [path, tab] of Object.entries(cases)) assert.equal(statsTab(path), tab, path);
});

test('statsTab: paths outside the stats section belong to no tab', () => {
  for (const path of ['/', '/play', '/more/players', '/statsx', '/stats/playersx', '/stats/unknown']) {
    assert.equal(statsTab(path), null, path);
  }
});

test('the four tabs in order: Oversikt, Spillere, Par, Kvelder', () => {
  assert.deepEqual(STATS_TABS.map((tab) => tab.id), ['overview', 'players', 'pairs', 'nights']);
  assert.deepEqual(STATS_TABS.map((tab) => tab.path), ['/stats', '/stats/players', '/stats/pairs', '/stats/nights']);
});

test('statsTabs: labels, links keeping only the season, the current tab marked', () => {
  const tabs = statsTabs('/stats/pair/Anne+Bj%C3%B8rn', { s: '2026-2', sandbox: '' });
  assert.deepEqual(tabs, [
    { id: 'overview', label: 'Oversikt', href: '#/stats?s=2026-2', current: false },
    { id: 'players', label: 'Spillere', href: '#/stats/players?s=2026-2', current: false },
    { id: 'pairs', label: 'Par', href: '#/stats/pairs?s=2026-2', current: true },
    { id: 'nights', label: 'Kvelder', href: '#/stats/nights?s=2026-2', current: false },
  ]);
  assert.equal(statsTabs('/stats/night/2026-10-13', {}).find((tab) => tab.current).href, '#/stats/nights');
});

test('breadcrumbParts: the list page (a link keeping the season), then the current page (no link)', () => {
  assert.deepEqual(breadcrumbParts('players', 'HP', { s: 'all', foo: '1' }), [
    { label: 'Spillere', href: '#/stats/players?s=all' },
    { label: 'HP' },
  ]);
  assert.deepEqual(breadcrumbParts('pairs', 'Anne & Bjørn', {}), [
    { label: 'Par', href: '#/stats/pairs' },
    { label: 'Anne & Bjørn' },
  ]);
  assert.deepEqual(breadcrumbParts('nights', '13. okt. 2026', {}), [
    { label: 'Kvelder', href: '#/stats/nights' },
    { label: '13. okt. 2026' },
  ]);
});

test('breadcrumbParts: without a current page, only the list page', () => {
  assert.deepEqual(breadcrumbParts('players', '', {}), [{ label: 'Spillere', href: '#/stats/players' }]);
});
