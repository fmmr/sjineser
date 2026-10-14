import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_RULES, SPLIT_RULES, proposeTeams } from '../../docs/js/domain/proposal.js';
import { rateGames } from '../../docs/js/domain/elo.js';
import { makeMatchId } from '../../docs/js/domain/match.js';
import { DATE, FOUR, dataset, game } from '../helpers.js';

const FIVE = ['Anne', 'Frode', 'Hans', 'Per', 'Tor'];
const night = (players, date = DATE) => ({ date, players });
const match = (number, [A1, A2], [B1, B2], date = DATE) => ({ matchId: makeMatchId(date, number), date, A1, A2, B1, B2 });
/** A complete match (team A wins 3–0) so it is not treated as the open match. */
const played = (m) => [m, [1, 2, 3].map((n) => game(m.matchId, n, 'A'))];

function build(nights, entries = []) {
  return dataset({
    nights,
    matches: entries.map(([m]) => m),
    games: entries.flatMap(([, games]) => games),
  });
}
const propose = (ds) => proposeTeams(ds, rateGames(ds));
const pairKeys = (p) => [p.A.join('+'), p.B.join('+')];

test('rule ids are unique and ordered as documented', () => {
  assert.deepEqual(BENCH_RULES.map((r) => r.id), ['fewestTonight', 'mostSitOutsSeason', 'longestSinceLastPlayed', 'alphabetical']);
  assert.deepEqual(SPLIT_RULES.map((r) => r.id), ['newPartners', 'balance', 'seasonVariety']);
});

test('no night or fewer than four players gives no proposal', () => {
  assert.equal(propose(dataset()), null);
  assert.equal(propose(build([night(FOUR.slice(0, 3))])), null);
});

test('four fresh players: first split in name order, nobody benched, no deciding rule', () => {
  assert.deepEqual(propose(build([night(FOUR)])), { A: ['Frode', 'Hans'], B: ['Per', 'Tor'], bench: [], benchRule: null, splitRule: null });
});

test('three matches with four players pair everyone with everyone', () => {
  let entries = [];
  const seen = new Set();
  for (let n = 1; n <= 3; n += 1) {
    const p = propose(build([night(FOUR)], entries));
    pairKeys(p).forEach((key) => seen.add(key));
    if (n > 1) assert.equal(p.splitRule, 'newPartners');
    entries = [...entries, played(match(n, p.A, p.B))];
  }
  assert.equal(seen.size, 6);
});

test('balance picks the most even split; small differences count as equal', () => {
  const ds = build([night(FOUR)]);
  const rated = { ratings: new Map([['Hans', 1100], ['Frode', 1080]]), gamesPlayed: new Map(), timeline: [] };
  const p = proposeTeams(ds, rated);
  assert.deepEqual([p.A, p.B], [['Frode', 'Per'], ['Hans', 'Tor']]);
  assert.equal(p.splitRule, 'balance');
});

test('five fresh players: the last name alphabetically sits out', () => {
  const p = propose(build([night(FIVE)]));
  assert.deepEqual(p.bench, ['Tor']);
  assert.equal(p.benchRule, 'alphabetical');
});

test('whoever sat out plays next', () => {
  const p = propose(build([night(FIVE)], [played(match(1, ['Anne', 'Frode'], ['Hans', 'Per']))]));
  assert.ok([...p.A, ...p.B].includes('Tor'));
  assert.deepEqual(p.bench, ['Per']);
});

test('earlier sit-outs this season give priority; last season does not count', () => {
  const earlier = (date) => build(
    [night(FIVE, date), night(FIVE)],
    [played(match(1, ['Anne', 'Frode'], ['Hans', 'Per'], date))],
  );
  const thisSeason = propose(earlier('2026-09-01'));
  assert.ok([...thisSeason.A, ...thisSeason.B].includes('Tor'));
  assert.deepEqual(thisSeason.bench, ['Per']);
  assert.equal(propose(earlier('2026-05-01')).bench[0], 'Tor');
});

test('on equal counts, whoever waited longest tonight plays', () => {
  const SIX = ['Anne', 'Bjørn', 'Cato', 'Dag', 'Erik', 'Finn'];
  const p = propose(build([night(SIX)], [
    played(match(1, ['Anne', 'Bjørn'], ['Erik', 'Finn'])),
    played(match(2, ['Cato', 'Dag'], ['Erik', 'Finn'])),
    played(match(3, ['Anne', 'Bjørn'], ['Cato', 'Dag'])),
  ]));
  assert.deepEqual(p.bench, ['Cato', 'Dag']);
});

test('an empty open match is ignored, since starting the next one replaces it', () => {
  const ds = build([night(FOUR)], [[match(1, ['Frode', 'Hans'], ['Per', 'Tor']), []]]);
  assert.deepEqual(pairKeys(propose(ds)), ['Frode+Hans', 'Per+Tor']);
});
