import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightSummary } from '../../../docs/js/views/stats/night-summary.js';
import { buildFacts } from '../../../docs/js/domain/stats/facts.js';
import { nightFilter } from '../../../docs/js/domain/stats/filter.js';
import { DATE, FOUR, MATCH_1, dataset, game } from '../../helpers.js';

const MATCH_2 = `${DATE}#2`;
const PLAYERS = [...FOUR, 'Kari'];

/** Five there (Kari sits out); set 1 Hans & Frode beat Tor & Per 3–0, set 2 unfinished at 0–1 with a draw. */
const night = () => dataset({
  players: PLAYERS.map((name) => ({ name, active: true })),
  nights: [{ date: DATE, players: PLAYERS }],
  matches: [
    { matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' },
    { matchId: MATCH_2, date: DATE, A1: 'Hans', A2: 'Tor', B1: 'Frode', B2: 'Per' },
  ],
  games: [game(MATCH_1, 1, 'A'), game(MATCH_1, 2, 'A'), game(MATCH_1, 3, 'A'), game(MATCH_2, 1, 'B'), game(MATCH_2, 2, 'D')],
});

const summary = (options) => nightSummary(buildFacts(night(), nightFilter(DATE), { today: '2026-10-20', hour: 20 }), DATE, options);
const lines = (options) => summary(options).text.split('\n');

test('nightSummary: the subject names the night with the long date', () => {
  assert.equal(summary().subject, 'Sjineser — kveld 14. okt. 2026');
});

test('nightSummary: opens with the night and who was there, then the winner with the gain', () => {
  const text = lines();
  assert.equal(text[0], 'Kveld 14. okt. 2026');
  assert.equal(text[1], 'Med: Frode, Hans, Kari, Per og Tor');
  assert.match(text.find((l) => l.startsWith('Kveldens vinner')), /^Kveldens vinner: Frode \(\+\d+\)$/);
});

test('nightSummary: the night leaderboard with change and games, sitting out last', () => {
  const text = lines();
  const start = text.indexOf('Kveldens rangering');
  assert.ok(start > 0);
  assert.match(text[start + 1], /^1\. Frode: \+\d+ \(5 spill\)$/);
  assert.match(text[start + 4], /^4\. Tor: −\d+ \(5 spill\)$/);
  assert.equal(text[start + 5], '5. Kari: sto over');
});

test('nightSummary: every set with teams, score, draws and an unfinished marker', () => {
  const text = lines();
  const start = text.indexOf('Sett');
  assert.equal(text[start + 1], 'Sett 1: Hans og Frode 3–0 Tor og Per');
  assert.equal(text[start + 2], 'Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (ikke ferdig)');
});

test('nightSummary: the last unfinished set of an ongoing night is "pågår"', () => {
  assert.ok(lines({ ongoing: true }).includes('Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (pågår)'));
});

test('nightSummary: records present that night (longest set, longest win streak, clean sweeps)', () => {
  const text = lines();
  const start = text.indexOf('Rekorder');
  assert.deepEqual(text.slice(start + 1, start + 4), [
    'Lengste sett: 3 spill (Sett 1: Hans og Frode 3–0 Tor og Per)',
    'Lengste seiersrekke: 4 spill (Frode)',
    'Rene seire (3–0): 1 (Frode 1, Hans 1)',
  ]);
});

test('nightSummary: ends with the link to the night page', () => {
  assert.equal(lines().at(-1), 'Se hele kvelden: https://sjineser.rodland.no/#/stats/night/2026-10-14');
});

test('nightSummary: a night without games says so and still links to the page', () => {
  const empty = dataset({ players: PLAYERS.map((name) => ({ name, active: true })), nights: [{ date: DATE, players: FOUR }] });
  const { text } = nightSummary(buildFacts(empty, nightFilter(DATE)), DATE);
  assert.ok(!text.includes('Rekorder'));
  assert.ok(text.includes('Ingen spill denne kvelden.'));
  assert.ok(text.endsWith('/#/stats/night/2026-10-14'));
});
