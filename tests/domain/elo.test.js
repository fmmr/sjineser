import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELO, expectedScore, gameEntries, isPenalty, isProvisional, penaltyEntries, rateGames, ratingOf,
} from '../../docs/js/domain/elo.js';
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

test('timeline records every player rating before each game', () => {
  const { timeline } = rateGames(withGames(['A', 'B']));
  assert.equal(timeline[0].before.get('Hans'), ELO.START);
  close(timeline[1].before.get('Hans'), ELO.START + ELO.K / 2);
  close(timeline[1].before.get('Hans'), timeline[0].before.get('Hans') + timeline[0].changes.get('Hans'));
  close(timeline[1].before.get('Tor'), ELO.START - ELO.K / 2);
});

test('a draw between unequal teams moves the weaker team up', () => {
  const rated = rateGames(withGames(['A', 'D']));
  assert.ok(ratingOf(rated, 'Tor') > ELO.START - ELO.K / 2);
  assert.ok(ratingOf(rated, 'Hans') < ELO.START + ELO.K / 2);
});

test('games of unknown matches do not count as played', () => {
  const ds = withGames(['A']);
  ds.games.push(game(`${DATE}#9`, 1, 'A'));
  assert.equal(rateGames(ds).gamesPlayed.get('Hans'), 1);
});

test('3 vs 2 between equal teams: all three winners gain K/2, both losers lose K/2', () => {
  const ds = dataset({
    matches: [{ matchId: M1, date: DATE, A1: 'Hans', A2: 'Frode', A3: 'Kari', B1: 'Tor', B2: 'Per', B3: '' }],
    games: [game(M1, 1, 'A')],
  });
  const rated = rateGames(ds);
  for (const name of ['Hans', 'Frode', 'Kari']) close(ratingOf(rated, name), ELO.START + ELO.K / 2);
  for (const name of ['Tor', 'Per']) close(ratingOf(rated, name), ELO.START - ELO.K / 2);
  assert.equal(rated.timeline[0].before.size, 5);
  assert.equal(rated.gamesPlayed.get('Kari'), 1);
});

test('3 vs 2: expected score from the team means; every team member gets the same change', () => {
  const M2 = `${DATE}#2`;
  const ds = dataset({
    matches: [
      { matchId: M1, date: DATE, A1: 'Hans', A2: 'Frode', A3: 'Kari', B1: 'Tor', B2: 'Per', B3: '' },
      { matchId: M2, date: DATE, A1: 'Hans', A2: 'Kari', A3: 'Tor', B1: 'Frode', B2: 'Per', B3: '' },
    ],
    games: [game(M1, 1, 'A'), game(M2, 1, 'B')],
  });
  const up = ELO.START + ELO.K / 2;
  const down = ELO.START - ELO.K / 2;
  // Game 2: A = Hans, Kari (up) and Tor (down); B = Frode (up) and Per (down).
  const meanA = (up + up + down) / 3;
  const meanB = (up + down) / 2;
  const delta = ELO.K * (0 - expectedScore(meanA, meanB));
  const rated = rateGames(ds);
  close(ratingOf(rated, 'Hans'), up + delta);
  close(ratingOf(rated, 'Kari'), up + delta);
  close(ratingOf(rated, 'Tor'), down + delta);
  close(ratingOf(rated, 'Frode'), up - delta);
  close(ratingOf(rated, 'Per'), down - delta);
  assert.ok(delta < -ELO.K / 2, 'the favourite loses more than K/2');
});

// ---------- no-show penalty ----------

const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';
const ALL5 = ['Hans', 'Frode', 'Tor', 'Per', 'Ola'];
const FOUR = ['Hans', 'Frode', 'Tor', 'Per'];
const WITH_OLA = ['Hans', 'Frode', 'Tor', 'Ola'];

/**
 * Nights of at most one match each: [date, roster, seats (A1 A2 B1 B2, or []), results]. Every
 * name in ALL5 is a player, active unless listed in `inactive`.
 */
function nights(list, inactive = []) {
  const ds = dataset({ players: ALL5.map((name) => ({ name, active: !inactive.includes(name) })) });
  for (const [date, roster, [A1, A2, B1, B2], results] of list) {
    const matchId = `${date}#1`;
    ds.nights.push({ date, players: roster });
    if (A1) ds.matches.push({ matchId, date, A1, A2, B1, B2 });
    [...results].forEach((result, i) => ds.games.push(game(matchId, i + 1, result)));
  }
  return ds;
}
const penalties = (rated) => penaltyEntries(rated).map(({ date, player, change }) => [date, player, change]);
const MISSED = -ELO.NO_SHOW_PENALTY;

test('no-show: an active player who has played and misses a played night loses NO_SHOW_PENALTY', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, WITH_OLA, WITH_OLA, 'D']]));
  assert.deepEqual(penalties(rated), [[N2, 'Per', MISSED]]);
  close(ratingOf(rated, 'Per'), ELO.START + MISSED);
  close(ratingOf(rated, 'Hans'), ELO.START);
});

test('no-show: nobody is penalised before their first night', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, FOUR, FOUR, 'D'], [N3, WITH_OLA, WITH_OLA, 'D']]));
  // Ola had never played before N3 (so no penalty on N1 or N2); Per missed N3.
  assert.deepEqual(penalties(rated), [[N3, 'Per', MISSED]]);
  close(ratingOf(rated, 'Ola'), ELO.START);
});

test('no-show: inactive players are exempt', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, WITH_OLA, WITH_OLA, 'D']], ['Per']));
  assert.deepEqual(penalties(rated), []);
});

test('no-show: on the roster but sitting out (or gone home) counts as there', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, ALL5, WITH_OLA, 'D']]));
  assert.deepEqual(penalties(rated), []);
});

test('no-show: nights without games are ignored', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, ['Hans'], [], ''], [N3, WITH_OLA, WITH_OLA, '']]));
  assert.deepEqual(penalties(rated), []);
});

test('no-show: missed nights accumulate', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, WITH_OLA, WITH_OLA, 'D'], [N3, WITH_OLA, WITH_OLA, 'D']]));
  assert.deepEqual(penalties(rated), [[N2, 'Per', MISSED], [N3, 'Per', MISSED]]);
  close(ratingOf(rated, 'Per'), ELO.START + 2 * MISSED);
});

test('no-show: penalties follow the night\'s games in the timeline and feed later expected scores', () => {
  const rated = rateGames(nights([[N1, FOUR, FOUR, 'D'], [N2, WITH_OLA, WITH_OLA, 'D'], [N3, FOUR, FOUR, 'A']]));
  const order = rated.timeline.map((entry) => (isPenalty(entry) ? `p:${entry.date}` : `g:${entry.game.matchId}`));
  assert.deepEqual(order, [`g:${N1}#1`, `g:${N2}#1`, `p:${N2}`, `g:${N3}#1`, `p:${N3}`]); // Per misses N2, Ola N3
  assert.equal(gameEntries(rated).length, 3);
  const last = gameEntries(rated).at(-1);
  close(last.before.get('Per'), ELO.START + MISSED);
  // Hans & Frode (START) beat Tor & Per (mean START − penalty / 2): less than K/2.
  const delta = ELO.K * (1 - expectedScore(ELO.START, ELO.START + MISSED / 2));
  close(last.changes.get('Hans'), delta);
  assert.ok(delta < ELO.K / 2);
});
