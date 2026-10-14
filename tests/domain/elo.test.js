import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELO, expectedScore, isProvisional, rateGames, ratingOf } from '../../docs/js/domain/elo.js';
import { DATE, dataset, game } from '../helpers.js';

const M1 = `${DATE}#1`;
const withGames = (results) => dataset({
  matches: [{ matchId: M1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' }],
  games: results.map((r, i) => game(M1, i + 1, r)),
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('expectedScore follows the Elo curve', () => {
  close(expectedScore(1000, 1000), 0.5);
  close(expectedScore(1000 + ELO.SCALE, 1000), 10 / 11);
});

test('everyone starts at START and unknown players are provisional', () => {
  const rated = rateGames(dataset());
  assert.equal(ratingOf(rated, 'Nobody'), ELO.START);
  assert.equal(isProvisional(rated, 'Nobody'), true);
});

test('a win between equal teams moves each player K/2', () => {
  const rated = rateGames(withGames(['A']));
  close(ratingOf(rated, 'Hans'), ELO.START + ELO.K / 2);
  close(ratingOf(rated, 'Frode'), ELO.START + ELO.K / 2);
  close(ratingOf(rated, 'Tor'), ELO.START - ELO.K / 2);
});

test('a draw between equal teams changes nothing; partners always change equally', () => {
  const rated = rateGames(withGames(['D']));
  close(ratingOf(rated, 'Hans'), ELO.START);
  const after = rateGames(withGames(['A', 'B']));
  const a = ELO.START + ELO.K / 2;
  const b = ELO.START - ELO.K / 2;
  close(ratingOf(after, 'Hans'), a - ELO.K * expectedScore(a, b));
  close(ratingOf(after, 'Hans'), ratingOf(after, 'Frode'));
  close(ratingOf(after, 'Tor'), b + ELO.K * expectedScore(a, b));
});

test('games are replayed in canonical order regardless of input order', () => {
  const ordered = withGames(['A', 'B', 'D']);
  const shuffled = { ...ordered, games: [...ordered.games].reverse() };
  close(ratingOf(rateGames(shuffled), 'Hans'), ratingOf(rateGames(ordered), 'Hans'));
});

test('games played and provisional status are tracked per player', () => {
  const rated = rateGames(withGames(Array(ELO.PROVISIONAL_GAMES).fill('D')));
  assert.equal(rated.gamesPlayed.get('Per'), ELO.PROVISIONAL_GAMES);
  assert.equal(isProvisional(rated, 'Per'), false);
  assert.equal(isProvisional(rateGames(withGames(['D'])), 'Per'), true);
});

test('timeline records each game with every player change; games of unknown matches are skipped', () => {
  const ds = withGames(['A']);
  ds.games.push(game(`${DATE}#9`, 1, 'A'));
  const { timeline } = rateGames(ds);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].game.matchId, M1);
  close(timeline[0].changes.get('Per'), -ELO.K / 2);
});
