import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NIGHT_ENDS_AT_HOUR, activeNight, compareGames, currentMatch, currentNight, isNightOngoing, isValidMatchId, latestMatch, makeMatchId,
  nextGameNo, nextMatchId, parseMatchId, sameSeats, score, seatsOf, teamOf, validSeats, winnerOf,
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

test('validSeats: each team 2–3 distinct non-empty names, nobody on both teams', () => {
  assert.equal(validSeats({ A1: 'a', A2: 'b', B1: 'c', B2: 'd' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: '', B1: 'c', B2: 'd', B3: '' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: 'e', B1: 'c', B2: 'd' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: 'e', B1: 'c', B2: 'd', B3: 'f' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'a', B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: '', B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: '', A3: 'e', B1: 'c', B2: 'd' }), false, 'A3 never replaces A2');
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: 'c', B1: 'c', B2: 'd' }), false, 'on both teams');
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: 'b', B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: 'b', A3: 42, B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: 'b', B1: 'c', B2: ['d'] }), false);
});

test('teamOf returns only the filled seats', () => {
  const match = { A1: 'a', A2: 'b', A3: 'e', B1: 'c', B2: 'd', B3: '' };
  assert.deepEqual(teamOf(match, 'A'), ['a', 'b', 'e']);
  assert.deepEqual(teamOf(match, 'B'), ['c', 'd']);
  assert.deepEqual(teamOf({ A1: 'a', A2: 'b', B1: 'c', B2: 'd' }, 'B'), ['c', 'd']);
});

test('sameSeats treats a missing third seat as empty', () => {
  const two = { A1: 'a', A2: 'b', B1: 'c', B2: 'd' };
  assert.equal(sameSeats(two, { ...two, A3: '', B3: '' }), true);
  assert.equal(sameSeats(two, { ...two, A3: 'e' }), false);
  assert.equal(sameSeats({ ...two, B3: 'f' }, { ...two, B3: 'f' }), true);
});

test('seatsOf turns two teams into all six seats', () => {
  assert.deepEqual(seatsOf(['a', 'b', 'e'], ['c', 'd']), { A1: 'a', A2: 'b', A3: 'e', B1: 'c', B2: 'd', B3: '' });
  assert.deepEqual(seatsOf(['a', 'b'], ['c', 'd']), { A1: 'a', A2: 'b', A3: '', B1: 'c', B2: 'd', B3: '' });
});

test('currentNight is the latest by date, not by row order', () => {
  const ds = dataset({ nights: [{ date: '2026-10-14', players: FOUR }, { date: '2026-09-01', players: FOUR }] });
  assert.equal(currentNight(ds).date, '2026-10-14');
  assert.equal(currentNight(dataset()), null);
});

test('a night is ongoing all of its own date, at any hour', () => {
  for (const hour of [0, 11, 12, 23]) assert.equal(isNightOngoing('2026-10-14', '2026-10-14', hour), true);
});

test('a night is ongoing the next day until NIGHT_ENDS_AT_HOUR (noon)', () => {
  assert.equal(NIGHT_ENDS_AT_HOUR, 12);
  assert.equal(isNightOngoing('2026-10-14', '2026-10-15', 0), true);
  assert.equal(isNightOngoing('2026-10-14', '2026-10-15', 11), true);
  assert.equal(isNightOngoing('2026-10-14', '2026-10-15', 12), false);
  assert.equal(isNightOngoing('2026-10-14', '2026-10-15', 23), false);
});

test('a night is over two days later, and not ongoing before its date', () => {
  assert.equal(isNightOngoing('2026-10-14', '2026-10-16', 0), false);
  assert.equal(isNightOngoing('2026-10-14', '2026-11-14', 0), false);
  assert.equal(isNightOngoing('2026-10-14', '2026-10-13', 20), false);
});

test('the noon rule crosses month, year, leap-day and DST boundaries', () => {
  assert.equal(isNightOngoing('2026-10-31', '2026-11-01', 11), true);
  assert.equal(isNightOngoing('2026-12-31', '2027-01-01', 11), true);
  assert.equal(isNightOngoing('2026-12-31', '2027-01-01', 12), false);
  assert.equal(isNightOngoing('2028-02-28', '2028-02-29', 3), true);
  assert.equal(isNightOngoing('2028-02-28', '2028-03-01', 3), false);
  assert.equal(isNightOngoing('2026-10-24', '2026-10-25', 11), true, 'night before DST ends');
  assert.equal(isNightOngoing('2027-03-27', '2027-03-28', 11), true, 'night before DST starts');
});

test('activeNight is the current night while ongoing, else null', () => {
  const ds = dataset({ nights: [{ date: '2026-10-14', players: FOUR }, { date: '2026-09-01', players: FOUR }] });
  assert.equal(activeNight(ds, '2026-10-14', 22).date, '2026-10-14');
  assert.equal(activeNight(ds, '2026-10-15', 11).date, '2026-10-14');
  assert.equal(activeNight(ds, '2026-10-15', 12), null);
  assert.equal(activeNight(ds, '2026-10-17', 20), null);
  assert.equal(activeNight(dataset(), '2026-10-14', 20), null);
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
