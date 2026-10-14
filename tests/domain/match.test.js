import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareGames, currentMatch, currentNight, isValidMatchId, latestMatch, makeMatchId,
  nextGameNo, nextMatchId, parseMatchId, score, validSeats, winnerOf,
} from '../../docs/js/domain/match.js';
import { DATE, FOUR, MATCH_1, dataset, game, nightWithMatch } from '../helpers.js';

const withMatches = (base, numbers) => ({
  ...base,
  matches: numbers.map((n) => ({ matchId: makeMatchId(DATE, n), date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' })),
});

test('match ids round-trip and validate', () => {
  assert.deepEqual(parseMatchId(makeMatchId(DATE, 12)), { date: DATE, number: 12 });
  assert.equal(isValidMatchId('2026-10-14#3'), true);
  assert.equal(isValidMatchId('2026-10-14-3'), false);
});

test('compareGames orders by date, numeric match number, game number', () => {
  const games = [game('2026-10-14#10', 1, 'A'), game('2026-10-14#2', 2, 'A'), game('2026-10-14#2', 1, 'A'), game('2026-09-01#5', 1, 'A')];
  assert.deepEqual(
    [...games].sort(compareGames).map((g) => `${g.matchId}/${g.gameNo}`),
    ['2026-09-01#5/1', '2026-10-14#2/1', '2026-10-14#2/2', '2026-10-14#10/1'],
  );
});

test('score counts each result', () => {
  assert.deepEqual(score(nightWithMatch(['A', 'D', 'B', 'D']).games), { A: 1, B: 1, D: 2 });
});

test('winnerOf returns the first team to three wins', () => {
  assert.equal(winnerOf(nightWithMatch(['A', 'A', 'D', 'B', 'A']).games), 'A');
  assert.equal(winnerOf(nightWithMatch(['A', 'B', 'A', 'B', 'D']).games), null);
});

test('validSeats requires four distinct non-empty names', () => {
  assert.equal(validSeats({ A1: 'a', A2: 'b', B1: 'c', B2: 'd' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'a', B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: '', B1: 'c', B2: 'd' }), false);
});

test('currentNight is the latest by date, not by row order', () => {
  const ds = dataset({ nights: [{ date: '2026-10-14', players: FOUR }, { date: '2026-09-01', players: FOUR }] });
  assert.equal(currentNight(ds).date, '2026-10-14');
  assert.equal(currentNight(dataset()), null);
});

test('latestMatch is the highest-numbered match of the current night', () => {
  const ds = withMatches(nightWithMatch(), [2, 10, 1]);
  assert.equal(latestMatch(ds).matchId, `${DATE}#10`);
});

test('currentMatch ignores an abandoned earlier match once a later one is complete', () => {
  const ds = withMatches(nightWithMatch(), [1, 2, 3]);
  ds.games = [game(`${DATE}#2`, 1, 'A'), ...['B', 'B', 'B'].map((r, i) => game(`${DATE}#3`, i + 1, r))];
  assert.equal(currentMatch(ds), null);
});

test('currentMatch returns the latest match while incomplete', () => {
  assert.equal(currentMatch(nightWithMatch(['A', 'D'])).matchId, MATCH_1);
});

test('nextMatchId counts numerically within the night', () => {
  assert.equal(nextMatchId(dataset(), DATE), `${DATE}#1`);
  assert.equal(nextMatchId(withMatches(nightWithMatch(), [1, 9]), DATE), `${DATE}#10`);
});

test('nextGameNo is one past the highest game number', () => {
  assert.equal(nextGameNo([]), 1);
  assert.equal(nextGameNo([game(MATCH_1, 1, 'A'), game(MATCH_1, 3, 'D')]), 4);
});
