import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore } from '../../../../docs/js/domain/elo.js';
import { MIN_GAMES_TOGETHER } from '../../../../docs/js/domain/stats/constants.js';
import { compareSubject, overallSubject, pairRows, pairSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HT_FP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const N2 = '2026-09-16';

// Frode & Hans vs Tor & Per: 11 games as pairs (8 wins for Frode & Hans). Hans & Tor vs Frode & Per:
// 3 games (too few). Kari joins Frode & Hans as a team of three: those games are not pair games for
// Frode & Hans, but Per & Tor are still a pair there (14 games).
const FACTS = factsOf([
  { date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'AABBA'], [HT_FP, 'AAA']] },
  { date: N2, players: ['Kari'], matches: [[HF_TP, 'BAA'], ['Kari Frode Hans - Tor Per', 'BBB']] },
]);

const ACTUAL = { W: 1, D: 0.5, L: 0 };

/** Mean of actual − expected over a pair's games, straight from the facts rows. */
const expected = (facts, names) => {
  const rows = pairRows(facts, names);
  return rows.reduce((sum, r) => sum + ACTUAL[r.outcome] - expectedScore(r.teamRating, r.opponentRating), 0) / rows.length;
};

test('chemistry: pairs with enough games, score above expectation, best first; row subject = pair', () => {
  assert.equal(MIN_GAMES_TOGETHER, 10, 'the fixture assumes 10');
  const value = compute('chemistry', FACTS, overallSubject());
  assert.deepEqual(value.columns, [
    { key: 'pair', format: 'pair' }, { key: 'games', format: 'int' }, { key: 'chemistry', format: 'signedPercent' },
  ]);
  assert.deepEqual(value.rows.map((r) => [r.pair, r.games]), [[['Frode', 'Hans'], 11], [['Per', 'Tor'], 14]]);
  const [fh, pt] = value.rows;
  assert.ok(Math.abs(fh.chemistry - expected(FACTS, ['Frode', 'Hans'])) < 1e-12);
  assert.ok(Math.abs(pt.chemistry - expected(FACTS, ['Per', 'Tor'])) < 1e-12);
  assert.ok(fh.chemistry > 0 && pt.chemistry < fh.chemistry);
  assert.deepEqual(fh.subject, pairSubject('Hans', 'Frode'));
});

test('chemistry: ties go to more games, then pair name; null when no pair qualifies', () => {
  // Ten draws between equally rated pairs: both exactly as expected (0).
  const draws = factsOf([{ date: N1, matches: [['Tor Per - Hans Frode', 'DDDDD'], [HF_TP, 'DDDDD']] }]);
  const rows = compute('chemistry', draws, overallSubject()).rows;
  assert.deepEqual(rows.map((r) => [r.pair, r.games, r.chemistry]), [[['Frode', 'Hans'], 10, 0], [['Per', 'Tor'], 10, 0]]);
  const more = factsOf([{ date: N1, matches: [['Tor Per - Hans Frode', 'DDDDD'], [HF_TP, 'DDDDD'], ['Tor Per - Kari Ola', 'D']] }]);
  assert.deepEqual(compute('chemistry', more, overallSubject()).rows.map((r) => r.pair), [['Per', 'Tor'], ['Frode', 'Hans']]);
  assert.equal(compute('chemistry', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }]), overallSubject()), null);
});

test('pairChemistry: the chemistry of a and b as a pair; null unless they qualify', () => {
  const value = compute('pairChemistry', FACTS, compareSubject('Hans', 'Frode'));
  assert.equal(value.format, 'signedPercent');
  assert.ok(Math.abs(value.value - expected(FACTS, ['Frode', 'Hans'])) < 1e-12);
  assert.deepEqual(compute('pairChemistry', FACTS, compareSubject('Frode', 'Hans')), value);
  assert.equal(compute('pairChemistry', FACTS, compareSubject('Hans', 'Tor')), null, 'only 3 games');
  assert.equal(compute('pairChemistry', FACTS, compareSubject('Kari', 'Hans')), null, 'team of three only');
});
