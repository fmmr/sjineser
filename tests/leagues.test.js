import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_LEAGUE, isLeagueId, leagueFromSearch, leagueQuery, leagueUrl, parseLeagueInput, storagePrefix,
} from '../docs/js/leagues.js';

test('isLeagueId: lowercase letters, digits and hyphens, 3–40 characters', () => {
  for (const ok of ['main', 'hp-k7x2', 'abc', '123', 'a'.repeat(40)]) assert.equal(isLeagueId(ok), true, ok);
  for (const bad of ['ab', 'a'.repeat(41), 'HP-k7x2', '-abc', 'a b', 'a_b', 'æøå', '', null, undefined, 42]) assert.equal(isLeagueId(bad), false, String(bad));
});

test('leagueFromSearch reads ?l= among other parameters; invalid or missing is null', () => {
  assert.equal(leagueFromSearch('?l=hp-k7x2'), 'hp-k7x2');
  assert.equal(leagueFromSearch('?sandbox&l=hp-k7x2'), 'hp-k7x2');
  assert.equal(leagueFromSearch('?l=main'), 'main');
  assert.equal(leagueFromSearch(''), null);
  assert.equal(leagueFromSearch('?sandbox'), null);
  assert.equal(leagueFromSearch('?l=PIN'), null);
  assert.equal(leagueFromSearch('?l=../x'), null);
});

test('parseLeagueInput: a whole link, a code, any case, with spaces', () => {
  assert.equal(parseLeagueInput('hp-k7x2'), 'hp-k7x2');
  assert.equal(parseLeagueInput('  HP-K7X2 '), 'hp-k7x2');
  assert.equal(parseLeagueInput('https://sjineser.rodland.no/?l=hp-k7x2#/play'), 'hp-k7x2');
  assert.equal(parseLeagueInput('https://sjineser.rodland.no/?sandbox&l=Hp-K7x2'), 'hp-k7x2');
  for (const bad of ['', '   ', 'hp', 'https://sjineser.rodland.no/', 'to ord', null, undefined]) assert.equal(parseLeagueInput(bad), null, String(bad));
});

test('leagueUrl keeps the path and goes to #/play unless told otherwise; main is explicit', () => {
  assert.equal(leagueUrl({ pathname: '/' }, 'hp-k7x2'), '/?l=hp-k7x2#/play');
  assert.equal(leagueUrl({ pathname: '/' }, MAIN_LEAGUE), '/?l=main#/play');
  assert.equal(leagueUrl({ pathname: '/app/' }, 'hp-k7x2', '#/more'), '/app/?l=hp-k7x2#/more');
});

test('storagePrefix: the main league keeps its old prefix, others get their own', () => {
  assert.equal(storagePrefix(MAIN_LEAGUE), 'sjineser:');
  assert.equal(storagePrefix('hp-k7x2'), 'sjineser-l-hp-k7x2:');
  assert.notEqual(storagePrefix('abc'), storagePrefix('abd'));
});

test('leagueQuery is empty for the main league (links in emails)', () => {
  assert.equal(leagueQuery(MAIN_LEAGUE), '');
  assert.equal(leagueQuery('hp-k7x2'), '?l=hp-k7x2');
});

test('cleanLeagueName: trimmed, 1–40 characters, no control characters', async () => {
  const { cleanLeagueName, LEAGUE_NAME_MAX } = await import('../docs/js/leagues.js');
  assert.equal(LEAGUE_NAME_MAX, 40);
  assert.equal(cleanLeagueName('  Jaktlaget '), 'Jaktlaget');
  assert.equal(cleanLeagueName('Familie-kineser å ø'), 'Familie-kineser å ø');
  assert.equal(cleanLeagueName('x'.repeat(40)), 'x'.repeat(40));
  for (const bad of ['', '   ', 'x'.repeat(41), 'a\nb', 'a\tb', null, undefined, 7]) assert.equal(cleanLeagueName(bad), null, String(bad));
});
