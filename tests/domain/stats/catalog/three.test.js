import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSubject, overallSubject, pairSubject, playerSubject,
} from '../../../../docs/js/domain/stats/subjects.js';
import { compute, factsOf } from './fixtures.js';

// Teams of three (spec §18): partners and opponents count every teammate / opponent, "pairs"
// mean 2-player teams only, compare counts any team size.

const N1 = '2026-09-02';
const HANS = playerSubject('Hans');

// #1 Hans, Frode & Kari vs Tor & Per: A A A (won by Hans's team).
// #2 Hans & Frode vs Tor, Per & Kari: D B B B (lost).
// #3 Hans & Tor vs Frode & Per: A B A A (won).
// #4 Frode & Hans vs Per & Tor: B B (unfinished).
const FACTS = factsOf([{ date: N1, matches: [
  ['Hans Frode Kari - Tor Per', 'AAA'],
  ['Hans Frode - Tor Per Kari', 'DBBB'],
  ['Hans Tor - Frode Per', 'ABAA'],
  ['Frode Hans - Per Tor', 'BB'],
] }]);

const WDL_COLUMNS = (key, format) => [
  { key, format }, { key: 'games', format: 'int' },
  { key: 'W', format: 'int' }, { key: 'D', format: 'int' }, { key: 'L', format: 'int' },
  { key: 'winRate', format: 'percent' },
];

test('partners: one row per teammate across all team sizes; a partner never paired links to compare', () => {
  assert.deepEqual(compute('partners', FACTS, HANS), { columns: WDL_COLUMNS('partner', 'player'), rows: [
    { partner: 'Frode', games: 9, W: 3, D: 1, L: 5, winRate: 3 / 9, subject: pairSubject('Hans', 'Frode') },
    { partner: 'Tor', games: 4, W: 3, D: 0, L: 1, winRate: 0.75, subject: pairSubject('Hans', 'Tor') },
    { partner: 'Kari', games: 3, W: 3, D: 0, L: 0, winRate: 1, subject: compareSubject('Hans', 'Kari') },
  ] });
});

test('opponents: each individual opponent, whatever the team size', () => {
  assert.deepEqual(compute('opponents', FACTS, HANS), { columns: WDL_COLUMNS('opponent', 'player'), rows: [
    { opponent: 'Per', games: 13, W: 6, D: 1, L: 6, winRate: 6 / 13, subject: compareSubject('Hans', 'Per') },
    { opponent: 'Tor', games: 9, W: 3, D: 1, L: 5, winRate: 3 / 9, subject: compareSubject('Hans', 'Tor') },
    { opponent: 'Frode', games: 4, W: 3, D: 0, L: 1, winRate: 0.75, subject: compareSubject('Hans', 'Frode') },
    { opponent: 'Kari', games: 4, W: 0, D: 1, L: 3, winRate: 0, subject: compareSubject('Hans', 'Kari') },
  ] });
});

test('player results count games and matches on 3-player teams', () => {
  assert.deepEqual(compute('gamesWdl', FACTS, playerSubject('Kari')), { W: 6, D: 1, L: 0 });
  assert.deepEqual(compute('matchesWdl', FACTS, playerSubject('Kari')), { W: 2, D: 0, L: 0 });
  assert.deepEqual(compute('matchesWdl', FACTS, HANS), { W: 2, D: 0, L: 1 });
});

test('pairsTable lists 2-player teams only', () => {
  const columns = [...WDL_COLUMNS('pair', 'pair'), { key: 'chemistry', format: 'signedPercent' }];
  assert.deepEqual(compute('pairsTable', FACTS, overallSubject()), { columns, rows: [
    { pair: ['Frode', 'Hans'], games: 6, W: 0, D: 1, L: 5, winRate: 0, chemistry: null, subject: pairSubject('Frode', 'Hans') },
    { pair: ['Per', 'Tor'], games: 5, W: 2, D: 0, L: 3, winRate: 0.4, chemistry: null, subject: pairSubject('Per', 'Tor') },
    { pair: ['Frode', 'Per'], games: 4, W: 1, D: 0, L: 3, winRate: 0.25, chemistry: null, subject: pairSubject('Frode', 'Per') },
    { pair: ['Hans', 'Tor'], games: 4, W: 3, D: 0, L: 1, winRate: 0.75, chemistry: null, subject: pairSubject('Hans', 'Tor') },
  ] });
});

test('pair page: only games as a 2-player team; versus lists opposing 2-player teams', () => {
  const pair = pairSubject('Hans', 'Frode');
  assert.deepEqual(compute('gamesWdl', FACTS, pair), { W: 0, D: 1, L: 5 });
  assert.deepEqual(compute('matchesWdl', FACTS, pair), { W: 0, D: 0, L: 1 });
  assert.deepEqual(compute('drawRate', FACTS, pair), { value: 1 / 6, format: 'percent' });
  assert.deepEqual(compute('pairVsPairs', FACTS, pair), { columns: WDL_COLUMNS('pair', 'pair'), rows: [
    { pair: ['Per', 'Tor'], games: 2, W: 0, D: 0, L: 2, winRate: 0, subject: pairSubject('Per', 'Tor') },
  ] });
  // Hans and Kari only ever played together on a team of three: not a pair.
  for (const id of ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate', 'pairVsPairs']) {
    assert.equal(compute(id, FACTS, pairSubject('Hans', 'Kari')), null, id);
  }
});

test('compare: together = same team of any size; head-to-head = opposite teams of any size', () => {
  assert.deepEqual(compute('togetherWdl', FACTS, compareSubject('Hans', 'Kari')), { W: 3, D: 0, L: 0 });
  assert.deepEqual(compute('togetherWdl', FACTS, compareSubject('Hans', 'Frode')), { W: 3, D: 1, L: 5 });
  assert.deepEqual(compute('headToHead', FACTS, compareSubject('Hans', 'Kari')),
    { left: { name: 'Hans', wins: 0 }, right: { name: 'Kari', wins: 3 }, draws: 1 });
});

test('bestPartner counts 2-player teams only; nemesis any opponent', () => {
  // Frode and Kari: 14 games with Hans on a team of three (6 wins); Tor: 10 as a pair (3 wins).
  const facts = factsOf([{ date: N1, matches: [
    ['Hans Frode Kari - Tor Per', 'DDDDAAA'],
    ['Hans Frode Kari - Tor Per', 'DDDDAAA'],
    ['Hans Tor - Frode Per', 'DDDDDDDAAA'],
  ] }]);
  assert.deepEqual(compute('bestPartner', facts, HANS), { value: 0.3, format: 'percent', holders: ['Tor'] });
  assert.deepEqual(compute('nemesis', facts, playerSubject('Per')), { value: 0, format: 'percent', holders: ['Hans'] });
});

test('match records show both teams, including a team of three', () => {
  const facts = factsOf([{ date: N1, matches: [['Hans Frode Kari - Tor Per', 'DDAAA']] }]);
  assert.deepEqual(compute('longestMatch', facts, overallSubject()).match,
    { A: ['Hans', 'Frode', 'Kari'], B: ['Tor', 'Per'], score: { A: 3, B: 0, D: 2 } });
  const unfinished = factsOf([{ date: N1, matches: [['Hans Frode Kari - Tor Per Ola', 'DDAA']] }]);
  assert.deepEqual(compute('longestMatch', unfinished, overallSubject()).match.B, ['Tor', 'Per', 'Ola']);
});
