import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTab, buildHash, matchRoute, parseHash, sandboxUrl } from '../docs/js/routing.js';
import { routes } from '../docs/js/views/routes.js';
import { mountStatsPlayer } from '../docs/js/views/stats/player.js';
import { mountStatsCompare } from '../docs/js/views/stats/compare.js';

const home = () => 'home';
const stats = () => 'stats';
const player = () => 'player';
const compare = () => 'compare';
const ROUTES = [
  ['/', home],
  ['/stats', stats],
  ['/stats/player/:name', player],
  ['/stats/compare/:a/:b', compare],
];

test('parseHash splits path and query', () => {
  assert.deepEqual(parseHash('#/stats/player/Anne?s=2026-2'), { path: '/stats/player/Anne', query: { s: '2026-2' } });
  assert.deepEqual(parseHash('#/stats'), { path: '/stats', query: {} });
  assert.deepEqual(parseHash('#/stats?s=all&x=1'), { path: '/stats', query: { s: 'all', x: '1' } });
});

test('parseHash treats an empty hash as the home route', () => {
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.deepEqual(parseHash('#'), { path: '/', query: {} });
  assert.deepEqual(parseHash('#?s=all'), { path: '/', query: { s: 'all' } });
});

test('matchRoute matches literal routes without params', () => {
  assert.deepEqual(matchRoute(ROUTES, '/stats'), { mount: stats, params: {} });
});

test('matchRoute extracts decoded params', () => {
  assert.deepEqual(matchRoute(ROUTES, '/stats/player/Anne'), { mount: player, params: { name: 'Anne' } });
  assert.deepEqual(matchRoute(ROUTES, '/stats/player/Bj%C3%B8rn%20%C3%86%C3%A5'),
    { mount: player, params: { name: 'Bjørn Æå' } });
  assert.deepEqual(matchRoute(ROUTES, '/stats/compare/Anne/Kari%20Ny'),
    { mount: compare, params: { a: 'Anne', b: 'Kari Ny' } });
});

test('matchRoute keeps + as a literal character', () => {
  assert.deepEqual(matchRoute([['/stats/pair/:pair', player]], '/stats/pair/Anne+Bj%C3%B8rn'),
    { mount: player, params: { pair: 'Anne+Bjørn' } });
});

test('matchRoute falls back to the home route', () => {
  assert.deepEqual(matchRoute(ROUTES, '/nowhere'), { mount: home, params: {} });
  assert.deepEqual(matchRoute(ROUTES, '/stats/player'), { mount: home, params: {} });
  assert.deepEqual(matchRoute(ROUTES, '/stats/player/Anne/extra'), { mount: home, params: {} });
  assert.deepEqual(matchRoute(ROUTES, '/stats/player/%E0%A4%A'), { mount: home, params: {} });
});

test('app routes: the player page with and without a name, and compare', () => {
  assert.deepEqual(matchRoute(routes, '/stats/player'), { mount: mountStatsPlayer, params: {} });
  assert.deepEqual(matchRoute(routes, '/stats/player/Anne'), { mount: mountStatsPlayer, params: { name: 'Anne' } });
  assert.deepEqual(matchRoute(routes, '/stats/compare/Anne/Per'), { mount: mountStatsCompare, params: { a: 'Anne', b: 'Per' } });
});

test('buildHash omits an empty query and encodes values', () => {
  assert.equal(buildHash('/stats', {}), '#/stats');
  assert.equal(buildHash('/stats'), '#/stats');
  assert.equal(buildHash('/stats', { s: 'all' }), '#/stats?s=all');
  assert.equal(buildHash('/stats', { s: 'a b+c&d' }), '#/stats?s=a%20b%2Bc%26d');
});

test('buildHash and parseHash round-trip', () => {
  const query = { s: '2026-2', who: 'Bjørn + Æse & co' };
  assert.deepEqual(parseHash(buildHash('/stats/pairs', query)), { path: '/stats/pairs', query });
});

test('activeTab: stats pages → stats; Mer and the explanation pages → more; the rest → play', () => {
  for (const path of ['/stats', '/stats/player/Anne', '/stats/pairs', '/stats/compare/A/B']) assert.equal(activeTab(path), 'stats', path);
  for (const path of ['/more', '/more/players', '/about', '/about/teams', '/about/rating']) assert.equal(activeTab(path), 'more', path);
  for (const path of ['/', '/play', '/play/night', '/play/new-match', '/play/match', '/unknown', '/statsx', '/aboutx', '/morex']) {
    assert.equal(activeTab(path), 'play', path);
  }
});

test('sandboxUrl switches test mode on and off and keeps the current screen', () => {
  assert.equal(sandboxUrl({ pathname: '/', hash: '#/stats/player/Anne' }, true), '/?sandbox#/stats/player/Anne');
  assert.equal(sandboxUrl({ pathname: '/', hash: '#/play' }, false), '/#/play');
  assert.equal(sandboxUrl({ pathname: '/app/', hash: '' }, true), '/app/?sandbox');
});
