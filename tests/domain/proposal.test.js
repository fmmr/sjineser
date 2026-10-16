import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_RULES, SPLIT_RULES, TEAM_SIZES, proposeTeams, splitsOf, teamSizesFor } from '../../docs/js/domain/proposal.js';
import { rateGames } from '../../docs/js/domain/elo.js';
import { makeMatchId, seatsOf } from '../../docs/js/domain/match.js';
import { DATE, FOUR, dataset, game } from '../helpers.js';

const FIVE = ['Anne', 'Frode', 'Hans', 'Per', 'Tor'];
const night = (players, date = DATE) => ({ date, players });
const match = (number, A, B, date = DATE) => ({ matchId: makeMatchId(date, number), date, ...seatsOf(A, B) });
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

const withRatings = (entries) => ({ ratings: new Map(Object.entries(entries)), gamesPlayed: new Map(), timeline: [] });

test('the reason is the rule that separated the choice from its closest competitor', () => {
  const ds = build([night(FOUR)], [played(match(1, ['Frode', 'Hans'], ['Per', 'Tor']))]);
  const p = proposeTeams(ds, withRatings({ Frode: 1100, Hans: 1050, Per: 1000, Tor: 900 }));
  assert.deepEqual(pairKeys(p), ['Frode+Tor', 'Hans+Per']);
  assert.equal(p.splitRule, 'balance');
});

test('balance rounds differences down to whole tolerance buckets', () => {
  // Differences: Frode+Per vs Hans+Tor 19, Frode+Tor vs Hans+Per 12 — same bucket, so name order wins.
  const sameBucket = withRatings({ Frode: 1000, Hans: 969, Per: 1057, Tor: 1050 });
  assert.deepEqual(pairKeys(proposeTeams(build([night(FOUR)]), sameBucket)), ['Frode+Per', 'Hans+Tor']);
  const history = build([night(FOUR, '2026-09-01'), night(FOUR)], [played(match(1, ['Frode', 'Per'], ['Hans', 'Tor'], '2026-09-01'))]);
  const fallThrough = proposeTeams(history, sameBucket);
  assert.deepEqual(pairKeys(fallThrough), ['Frode+Tor', 'Hans+Per']);
  assert.equal(fallThrough.splitRule, 'seasonVariety');
  // Differences 11 and 9 fall in different buckets, so balance decides.
  const decided = proposeTeams(build([night(FOUR)]), withRatings({ Frode: 1000, Hans: 980, Per: 1052, Tor: 1050 }));
  assert.deepEqual(pairKeys(decided), ['Frode+Tor', 'Hans+Per']);
  assert.equal(decided.splitRule, 'balance');
});

const SIX = ['Anne', 'Bjørn', 'Cato', 'Dag', 'Erik', 'Finn'];
const SEVEN = [...FIVE, 'Geir', 'Ola'];
const EIGHT = ['Anne', 'Bjørn', 'Cato', 'Dag', 'Erik', 'Finn', 'Geir', 'Hege'];

test('team sizes: 4 → 2+2, 5 → 3+2, 6 and more → 3+3', () => {
  assert.deepEqual(TEAM_SIZES, { 4: [2, 2], 5: [3, 2], 6: [3, 3] });
  assert.deepEqual([4, 5, 6, 7, 10].map(teamSizesFor), [[2, 2], [3, 2], [3, 3], [3, 3], [3, 3]]);
  assert.equal(teamSizesFor(3), null);
});

test('splitsOf: every split once, in a fixed order', () => {
  const four = splitsOf(['a', 'b', 'c', 'd'], [2, 2]).map((s) => `${s.A}|${s.B}`);
  assert.deepEqual(four, ['a,b|c,d', 'a,c|b,d', 'a,d|b,c']);
  const five = splitsOf(['a', 'b', 'c', 'd', 'e'], [3, 2]).map((s) => `${s.A}|${s.B}`);
  assert.equal(five.length, 10);
  assert.deepEqual(five.slice(0, 3), ['a,b,c|d,e', 'a,b,d|c,e', 'a,b,e|c,d']);
  assert.equal(five.at(-1), 'c,d,e|a,b');
  const six = splitsOf(['a', 'b', 'c', 'd', 'e', 'f'], [3, 3]);
  assert.equal(six.length, 10, 'mirror images are the same split');
  assert.ok(six.every((s) => s.A.includes('a')));
  assert.equal(new Set(six.map((s) => `${s.A}|${s.B}`)).size, 10);
  // Teammate pairs: all pairs within each team.
  assert.deepEqual(splitsOf(['a', 'b', 'c', 'd', 'e'], [3, 2])[0].pairs, [['a', 'b'], ['a', 'c'], ['b', 'c'], ['d', 'e']]);
});

test('five fresh players: everyone plays, three against two', () => {
  const p = propose(build([night(FIVE)]));
  assert.deepEqual(p, { A: ['Anne', 'Frode', 'Hans'], B: ['Per', 'Tor'], bench: [], benchRule: null, splitRule: null });
});

test('five players: new partners first, then balance by team means', () => {
  const ds = build([night(FIVE)], [played(match(1, ['Anne', 'Frode', 'Hans'], ['Per', 'Tor']))]);
  const p = propose(ds);
  assert.equal(p.A.length, 3);
  assert.equal(p.B.length, 2);
  assert.equal(p.splitRule, 'newPartners');
  // Of 10 splits only one has no teammate pair from match 1: impossible (Per+Tor and three of
  // Anne/Frode/Hans), so the fewest repeated pairs win: one repeated pair.
  const repeated = [[...p.A], [...p.B]].flatMap((team) => team.flatMap((x, i) => team.slice(i + 1).map((y) => [x, y])))
    .filter(([x, y]) => (['Anne', 'Frode', 'Hans'].includes(x) && ['Anne', 'Frode', 'Hans'].includes(y)) || (x === 'Per' && y === 'Tor'));
  assert.equal(repeated.length, 1);

  const fresh = build([night(FIVE)]);
  const balanced = proposeTeams(fresh, withRatings({ Anne: 1200, Frode: 1000, Hans: 1000, Per: 1000, Tor: 800 }));
  assert.equal(balanced.splitRule, 'balance');
  const mean = (team) => team.reduce((sum, name) => sum + ({ Anne: 1200, Tor: 800 }[name] ?? 1000), 0) / team.length;
  assert.ok(Math.abs(mean(balanced.A) - mean(balanced.B)) < 10, `${balanced.A} vs ${balanced.B}`);
});

test('six players: three against three, nobody benched', () => {
  const p = propose(build([night(SIX)]));
  assert.deepEqual(p, { A: ['Anne', 'Bjørn', 'Cato'], B: ['Dag', 'Erik', 'Finn'], bench: [], benchRule: null, splitRule: null });
  const next = propose(build([night(SIX)], [played(match(1, p.A, p.B))]));
  assert.equal(next.A.length + next.B.length, 6);
  assert.equal(next.splitRule, 'newPartners');
});

test('seven players: the bench rules choose six, who play three against three', () => {
  const p = propose(build([night(SEVEN)]));
  assert.deepEqual(p.bench, ['Tor']);
  assert.equal(p.benchRule, 'alphabetical');
  assert.deepEqual([p.A.length, p.B.length], [3, 3]);
});

test('whoever sat out plays next', () => {
  const p = propose(build([night(SEVEN)], [played(match(1, ['Anne', 'Frode', 'Geir'], ['Hans', 'Ola', 'Per']))]));
  assert.ok([...p.A, ...p.B].includes('Tor'));
  assert.deepEqual(p.bench, ['Per']);
});

test('earlier sit-outs this season give priority; last season does not count', () => {
  const earlier = (date) => build(
    [night(SEVEN, date), night(SEVEN)],
    [played(match(1, ['Anne', 'Frode', 'Geir'], ['Hans', 'Ola', 'Per'], date))],
  );
  const thisSeason = propose(earlier('2026-09-01'));
  assert.ok([...thisSeason.A, ...thisSeason.B].includes('Tor'));
  assert.deepEqual(thisSeason.bench, ['Per']);
  // Tor's sit-out lifted Tor above the cut; between Ola (last in) and Per only the name differs.
  assert.equal(thisSeason.benchRule, 'alphabetical');
  assert.equal(propose(earlier('2026-05-01')).bench[0], 'Tor');
});

test('the bench reason is sit-outs when the benched player has sat out fewer times', () => {
  const date = '2026-09-01';
  const benchedOnce = ['Tor', 'Hans', 'Frode', 'Anne', 'Geir', 'Ola'];
  const p = propose(build([night(SEVEN, date), night(SEVEN)], benchedOnce.map((out, i) => {
    const playing = SEVEN.filter((name) => name !== out);
    return played(match(i + 1, playing.slice(0, 3), playing.slice(3), date));
  })));
  assert.deepEqual(p.bench, ['Per']);
  assert.equal(p.benchRule, 'mostSitOutsSeason');
});

test('on equal counts, whoever waited longest tonight plays', () => {
  // Four matches, everyone sits out once; Anne and Bjørn sat out the last one.
  const p = propose(build([night(EIGHT)], [
    played(match(1, ['Anne', 'Bjørn', 'Cato'], ['Dag', 'Erik', 'Finn'])),
    played(match(2, ['Anne', 'Bjørn', 'Cato'], ['Dag', 'Geir', 'Hege'])),
    played(match(3, ['Anne', 'Bjørn', 'Erik'], ['Finn', 'Geir', 'Hege'])),
    played(match(4, ['Cato', 'Dag', 'Erik'], ['Finn', 'Geir', 'Hege'])),
  ]));
  assert.ok(['Anne', 'Bjørn'].every((name) => [...p.A, ...p.B].includes(name)));
  assert.deepEqual(p.bench, ['Geir', 'Hege']);
  // Finn (last in) and Geir differ only by name.
  assert.equal(p.benchRule, 'alphabetical');
});

test('the bench reason is waiting time when it separates the last in from the benched', () => {
  const TWELVE = [...EIGHT, 'Ivar', 'Jon', 'Kai', 'Liv'];
  const p = propose(build([night(TWELVE)], [
    played(match(1, ['Anne', 'Bjørn', 'Cato'], ['Dag', 'Erik', 'Finn'])),
    played(match(2, ['Geir', 'Hege', 'Ivar'], ['Jon', 'Kai', 'Liv'])),
  ]));
  assert.deepEqual(p.bench, ['Geir', 'Hege', 'Ivar', 'Jon', 'Kai', 'Liv']);
  assert.equal(p.benchRule, 'longestSinceLastPlayed');
});

test('an empty open match is ignored, since starting the next one replaces it', () => {
  const ds = build([night(FOUR)], [[match(1, ['Frode', 'Hans'], ['Per', 'Tor']), []]]);
  assert.deepEqual(pairKeys(propose(ds)), ['Frode+Hans', 'Per+Tor']);
});

test('an empty match on an earlier night does not count as a sit-out', () => {
  const date = '2026-09-01';
  const p = propose(build([night(SEVEN, date), night(SEVEN)], [[match(1, ['Anne', 'Frode', 'Geir'], ['Hans', 'Ola', 'Per'], date), []]]));
  assert.deepEqual(p.bench, ['Tor']);
  assert.equal(p.benchRule, 'alphabetical');
});
