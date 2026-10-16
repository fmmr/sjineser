import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubject, pairSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HP_FT, HT_FP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';
const HANS = playerSubject('Hans');
const NOBODY = playerSubject('Nobody');

// Hans: N1 #1 W W D W (won), #2 L L D L (lost), #3 W L W L (unfinished); N2 #1 D D W (unfinished).
const MAIN = factsOf([
  { date: N1, matches: [[HF_TP, 'AADA'], [HT_FP, 'BBDB'], [HP_FT, 'ABAB']] },
  { date: N2, matches: [[HF_TP, 'DDA']] },
  { date: N3, matches: [['Tor Per - Frode Ola', 'A']] },
]);

test('rating: the current rating whatever the period, provisional marker below 10 games', () => {
  assert.deepEqual(compute('rating', factsOf([{ date: N1, matches: [[HF_TP, 'A']] }]), HANS),
    { value: 1012, format: 'rating', marker: 'provisional' });
  const hans = MAIN.rows.filter((r) => r.player === 'Hans');
  assert.deepEqual(compute('rating', MAIN, HANS), { value: hans.at(-1).ratingAfter, format: 'rating' });
  const spring = factsOf([{ date: '2026-03-04', matches: [[HF_TP, 'A']] }, { date: N1, matches: [[HF_TP, 'A']] }],
    { kind: 'season', year: 2026, half: 1 });
  assert.notEqual(compute('rating', spring, HANS).value, 1012, 'not the rating at the end of spring');
  assert.equal(compute('rating', spring, HANS).value, spring.rated.ratings.get('Hans'));
  assert.equal(compute('rating', MAIN, NOBODY), null);
});

test('eloChart: one point per night played, the rating after the last game that night', () => {
  const hans = MAIN.rows.filter((r) => r.player === 'Hans');
  assert.deepEqual(compute('eloChart', MAIN, HANS), { series: [{ name: 'Hans', points: [
    { x: N1, y: hans[11].ratingAfter },
    { x: N2, y: hans[14].ratingAfter },
  ] }] });
  assert.deepEqual(compute('eloChart', factsOf([{ date: N1, matches: [[HF_TP, 'A']] }]), HANS),
    { series: [{ name: 'Hans', points: [{ x: N1, y: 1012 }] }] });
  assert.equal(compute('eloChart', MAIN, NOBODY), null);
});

test('gamesWdl and gameWinRate count every game', () => {
  assert.deepEqual(compute('gamesWdl', MAIN, HANS), { W: 6, D: 4, L: 5 });
  assert.deepEqual(compute('gameWinRate', MAIN, HANS), { value: 6 / 15, format: 'percent' });
  assert.equal(compute('gamesWdl', MAIN, NOBODY), null);
  assert.equal(compute('gameWinRate', MAIN, NOBODY), null);
});

test('matchesWdl and matchWinRate count finished matches only', () => {
  assert.deepEqual(compute('matchesWdl', MAIN, HANS), { W: 1, D: 0, L: 1 });
  assert.deepEqual(compute('matchWinRate', MAIN, HANS), { value: 0.5, format: 'percent' });
  const unfinished = factsOf([{ date: N1, matches: [[HF_TP, 'AAD']] }]);
  assert.equal(compute('matchesWdl', unfinished, HANS), null);
  assert.equal(compute('matchWinRate', unfinished, HANS), null);
});

test('drawRate for a player', () => {
  assert.deepEqual(compute('drawRate', MAIN, HANS), { value: 4 / 15, format: 'percent' });
});

test('streaks: current and longest win, unbeaten and loss runs', () => {
  // W W D W L L D L W L W L D D W
  assert.deepEqual(compute('streaks', MAIN, HANS), {
    columns: [{ key: 'kind', format: 'label' }, { key: 'current', format: 'int' }, { key: 'longest', format: 'int' }],
    rows: [
      { kind: 'streak_win', current: 1, longest: 2 },
      { kind: 'streak_unbeaten', current: 3, longest: 4 },
      { kind: 'streak_loss', current: 0, longest: 2 },
    ],
  });
  assert.equal(compute('streaks', MAIN, NOBODY), null);
});

const WDL_COLUMNS = (key) => [
  { key, format: 'player' }, { key: 'games', format: 'int' },
  { key: 'W', format: 'int' }, { key: 'D', format: 'int' }, { key: 'L', format: 'int' },
  { key: 'winRate', format: 'percent' },
];

test('partners: per partner, most games first (ties by name); row subject = pair', () => {
  assert.deepEqual(compute('partners', MAIN, HANS), { columns: WDL_COLUMNS('partner'), rows: [
    { partner: 'Frode', games: 7, W: 4, D: 3, L: 0, winRate: 4 / 7, subject: pairSubject('Hans', 'Frode') },
    { partner: 'Per', games: 4, W: 2, D: 0, L: 2, winRate: 0.5, subject: pairSubject('Hans', 'Per') },
    { partner: 'Tor', games: 4, W: 0, D: 1, L: 3, winRate: 0, subject: pairSubject('Hans', 'Tor') },
  ] });
  assert.equal(compute('partners', MAIN, NOBODY), null);
});

test('opponents: per individual opponent; row subject = compare', () => {
  assert.deepEqual(compute('opponents', MAIN, HANS), { columns: WDL_COLUMNS('opponent'), rows: [
    { opponent: 'Per', games: 11, W: 4, D: 4, L: 3, winRate: 4 / 11, subject: compareSubject('Hans', 'Per') },
    { opponent: 'Tor', games: 11, W: 6, D: 3, L: 2, winRate: 6 / 11, subject: compareSubject('Hans', 'Tor') },
    { opponent: 'Frode', games: 8, W: 2, D: 1, L: 5, winRate: 2 / 8, subject: compareSubject('Hans', 'Frode') },
  ] });
  assert.equal(compute('opponents', MAIN, NOBODY), null);
});

// Hans with Frode: 10 games, 3 wins; with Tor: 20 games, 6 wins; with Per: 9 games, 9 wins (too few).
const PEOPLE = factsOf([{ date: N1, matches: [
  [HF_TP, 'DDDDDDDAAA'], [HT_FP, 'DDDDDDDAAA'], [HT_FP, 'DDDDDDDAAA'], [HP_FT, 'AAA'], [HP_FT, 'AAA'], [HP_FT, 'AAA'],
] }]);

test('bestPartner: highest win rate with at least 10 games together; tie → more games', () => {
  assert.deepEqual(compute('bestPartner', PEOPLE, HANS), { value: 0.3, format: 'percent', holders: ['Tor'] });
  assert.equal(compute('bestPartner', MAIN, HANS), null, 'no partner with 10 games');
  assert.equal(compute('bestPartner', MAIN, NOBODY), null);
});

test('nemesis: lowest win rate against, at least 10 games; tie → more games', () => {
  // Against Tor 19 games (12 W), Per 30 (9 W), Frode 29 (15 W).
  assert.deepEqual(compute('nemesis', PEOPLE, HANS), { value: 0.3, format: 'percent', holders: ['Per'] });
  const tie = factsOf([{ date: N1, matches: [['Hans Ola - Tor Per', 'DDDDDDDBBB'], ['Hans Tor - Per Ola', 'DDDDDDDBBB']] }]);
  assert.deepEqual(compute('nemesis', tie, HANS), { value: 0, format: 'percent', holders: ['Per'] });
  assert.deepEqual(compute('nemesis', MAIN, HANS), { value: 4 / 11, format: 'percent', holders: ['Per'] },
    'Frode (8 games) is below the minimum');
  assert.equal(compute('nemesis', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }]), HANS), null, 'no opponent with 10 games');
});

test('form: the last 10 games in the period, oldest first; fewer when fewer are played', () => {
  // W W D W L L D L W L W L D D W → the last ten.
  assert.deepEqual(compute('form', MAIN, HANS), { outcomes: ['L', 'D', 'L', 'W', 'L', 'W', 'L', 'D', 'D', 'W'] });
  assert.deepEqual(compute('form', factsOf([{ date: N1, matches: [[HF_TP, 'AB']] }]), HANS), { outcomes: ['W', 'L'] });
  const autumn = factsOf([
    { date: '2026-03-04', matches: [[HF_TP, 'AAA']] },
    { date: N1, matches: [[HF_TP, 'BD']] },
  ], { kind: 'season', year: 2026, half: 2 });
  assert.deepEqual(compute('form', autumn, HANS), { outcomes: ['L', 'D'] }, 'only games in the period');
  assert.equal(compute('form', MAIN, NOBODY), null);
});

test('player stats follow the season filter', () => {
  const facts = factsOf([
    { date: '2026-03-04', matches: [[HF_TP, 'AAA']] },
    { date: N1, matches: [[HF_TP, 'BBB']] },
  ], { kind: 'season', year: 2026, half: 2 });
  assert.deepEqual(compute('gamesWdl', facts, HANS), { W: 0, D: 0, L: 3 });
  assert.deepEqual(compute('eloChart', facts, HANS).series[0].points.map((p) => p.x), [N1]);
});
