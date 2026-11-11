import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightFilter } from '../../../../docs/js/domain/stats/filter.js';
import { overallSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { seasonWinners } from '../../../../docs/js/domain/stats/catalog/seasonPlayers.js';
import { ELO } from '../../../../docs/js/domain/elo.js';
import { HF_TP, compute, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const AUTUMN_2025 = '2025-10-01';
const SPRING = '2026-03-04';
const AUTUMN = '2026-09-02';

// Høst 2025: Hans & Tor win 3–0 (tie on change and games → Hans by name).
// Vår 2026: Hans wins three games (two with Frode, one with Ola) → Hans.
// Høst 2026: Tor & Per win 3–0 (tie → Per by name).
const NIGHTS = [
  { date: AUTUMN_2025, matches: [['Hans Tor - Frode Per', 'AAA']] },
  { date: SPRING, matches: [[HF_TP, 'AA'], ['Hans Ola - Tor Per', 'A']] },
  { date: AUTUMN, matches: [[HF_TP, 'BBB']] },
];
const FACTS = factsOf(NIGHTS);

/** A player's total rating change in the given dates, straight from the facts rows. */
const gainOf = (name, date) => FACTS.rows.filter((r) => r.player === name && r.date === date).reduce((sum, r) => sum + r.delta, 0);

test('seasonWinners: per season the most rating won, newest first; tie → more games, then name', () => {
  assert.deepEqual(seasonWinners(FACTS).map(({ season, player, games }) => [season, player, games]), [
    [{ year: 2026, half: 2 }, 'Per', 3],
    [{ year: 2026, half: 1 }, 'Hans', 3],
    [{ year: 2025, half: 2 }, 'Hans', 3],
  ]);
  assert.equal(seasonWinners(FACTS)[1].change, gainOf('Hans', SPRING));
  assert.ok(gainOf('Hans', SPRING) > gainOf('Frode', SPRING));
});

test('seasonWinners: only over all seasons (a season or night filter does not hold the other seasons)', () => {
  assert.deepEqual(seasonWinners(factsOf(NIGHTS, { kind: 'season', year: 2026, half: 1 })), []);
  assert.deepEqual(seasonWinners(factsOf(NIGHTS, nightFilter(SPRING))), []);
});

test('seasonPlayers: a table of season, player, change and games, newest season first', () => {
  const value = compute('seasonPlayers', FACTS, OVERALL);
  assert.deepEqual(value.columns.map((c) => [c.key, c.format]), [
    ['season', 'season'], ['player', 'player'], ['change', 'signed'], ['games', 'int'],
  ]);
  assert.deepEqual(value.rows.map((r) => [r.season, r.player]), [
    [{ year: 2026, half: 2 }, 'Per'], [{ year: 2026, half: 1 }, 'Hans'], [{ year: 2025, half: 2 }, 'Hans'],
  ]);
  assert.equal(value.rows[0].change, gainOf('Per', AUTUMN));
  assert.equal(compute('seasonPlayers', factsOf(NIGHTS, { kind: 'season', year: 2026, half: 2 }), OVERALL), null);
  assert.equal(compute('seasonPlayers', factsOf(NIGHTS, nightFilter(AUTUMN)), OVERALL), null);
  assert.equal(compute('seasonPlayers', factsOf([]), OVERALL), null);
});

test('seasonTitles: how many seasons the player won, and which (newest first)', () => {
  assert.deepEqual(compute('seasonTitles', FACTS, playerSubject('Hans')),
    { value: 2, format: 'int', holders: [], seasons: [{ year: 2026, half: 1 }, { year: 2025, half: 2 }] });
  assert.deepEqual(compute('seasonTitles', FACTS, playerSubject('Per')),
    { value: 1, format: 'int', holders: [], seasons: [{ year: 2026, half: 2 }] });
  assert.equal(compute('seasonTitles', FACTS, playerSubject('Tor')), null, 'no season won');
  assert.equal(compute('seasonTitles', factsOf(NIGHTS, { kind: 'season', year: 2026, half: 1 }), playerSubject('Hans')), null);
});

test('seasonWinners: no-show penalties count in the season\'s change; only players with games can win', () => {
  // Spring: Hans & Frode draw Tor & Per. Autumn: Per is not there (penalty); the others draw.
  const facts = factsOf([
    { date: SPRING, matches: [[HF_TP, 'D']] },
    { date: AUTUMN, matches: [['Hans Frode - Tor Ola', 'D']] },
  ]);
  assert.deepEqual(facts.penalties, [{ date: AUTUMN, player: 'Per', change: -ELO.NO_SHOW_PENALTY }]);
  const autumn = seasonWinners(facts)[0];
  assert.equal(autumn.change, 0);
  assert.notEqual(autumn.player, 'Per');
});

test('seasonWinners: a winner\'s change includes their penalties in the season', () => {
  // Spring: Hans & Frode win. Autumn night 1: Hans is not there. Night 2: Hans & Ola win twice.
  const later = '2026-09-16';
  const facts = factsOf([
    { date: SPRING, matches: [[HF_TP, 'A']] },
    { date: AUTUMN, matches: [['Frode Tor - Per Ola', 'A']] },
    { date: later, matches: [['Hans Ola - Tor Per', 'AA']] },
  ]);
  const gain = facts.rows.filter((r) => r.player === 'Hans' && r.date === later).reduce((sum, r) => sum + r.delta, 0);
  const autumn = seasonWinners(facts)[0];
  assert.equal(autumn.player, 'Hans');
  assert.equal(autumn.change, gain - ELO.NO_SHOW_PENALTY);
});
