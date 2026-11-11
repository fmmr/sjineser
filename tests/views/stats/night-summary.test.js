import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightSummary, nightSummaryData } from '../../../docs/js/views/stats/night-summary.js';
import { buildFacts } from '../../../docs/js/domain/stats/facts.js';
import { nightFilter, seasonFilterOf } from '../../../docs/js/domain/stats/filter.js';
import { DATE, FOUR, MATCH_1, dataset, game } from '../../helpers.js';

const MATCH_2 = `${DATE}#2`;
const CLOCK = { today: '2026-10-20', hour: 20 };

/**
 * Five there (`bench` sits out); set 1 Hans & Frode beat Tor & Per 3–0, set 2 unfinished at
 * 0–1 with a draw. Frode wins four in a row.
 */
const night = (bench = 'Kari') => {
  const players = [...FOUR, bench];
  return dataset({
    players: players.map((name) => ({ name, active: true })),
    nights: [{ date: DATE, players }],
    matches: [
      { matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' },
      { matchId: MATCH_2, date: DATE, A1: 'Hans', A2: 'Tor', B1: 'Frode', B2: 'Per' },
    ],
    games: [game(MATCH_1, 1, 'A'), game(MATCH_1, 2, 'A'), game(MATCH_1, 3, 'A'), game(MATCH_2, 1, 'B'), game(MATCH_2, 2, 'D')],
  });
};

const facts = (data = night()) => [buildFacts(data, nightFilter(DATE), CLOCK), buildFacts(data, seasonFilterOf(DATE), CLOCK)];
const summary = (options, data) => nightSummary(...facts(data), DATE, options);
const lines = (options) => summary(options).text.split('\n');
/** The lines of the text block that starts with `heading` (up to the next blank line). */
function section(heading) {
  const text = lines();
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `no section ${heading}`);
  const end = text.indexOf('', start);
  return text.slice(start + 1, end < 0 ? undefined : end);
}

test('nightSummary: the subject names the night with the long date', () => {
  assert.equal(summary().subject, 'Sjineser — kveld 14. okt. 2026');
});

test('nightSummary: opens with the night and who was there, the winner with the gain and a talking point', () => {
  const text = lines();
  assert.equal(text[0], 'Kveld 14. okt. 2026');
  assert.equal(text[1], 'Med: Frode, Hans, Kari, Per og Tor');
  assert.match(text[3], /^Kveldens vinner: Frode \(\+\d+\)$/);
  assert.equal(text[4], 'Frode vant 4 spill på rad.');
});

test('nightSummary: the sections come in order: sets, leaderboard, decisive, pairs, records, season, links', () => {
  const text = lines();
  const order = ['Sett', 'Kveldens rangering', 'Avgjørende spill', 'Kveldens par', 'Rekorder', 'Høst 2026 så langt', 'Ligatabell',
    'Rating og endring i sesongen'].map((heading) => text.indexOf(heading));
  assert.ok(order.every((i) => i > 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('nightSummary: every set with teams, score, draws and an unfinished marker', () => {
  assert.deepEqual(section('Sett'), ['Sett 1: Hans og Frode 3–0 Tor og Per', 'Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (ikke ferdig)']);
});

test('nightSummary: the last unfinished set of an ongoing night is "pågår"', () => {
  assert.ok(lines({ ongoing: true }).includes('Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (pågår)'));
});

test('nightSummary: the night leaderboard with change, games, rating and form, sitting out last', () => {
  const rows = section('Kveldens rangering');
  assert.match(rows[0], /^1\. Frode: \+\d+ \(5 spill\), rating \d+( · ny)?, form SSSSU$/);
  assert.match(rows[3], /^4\. Tor: −\d+ \(5 spill\), rating \d+( · ny)?, form TTTTU$/);
  assert.equal(rows[4], '5. Kari: sto over');
});

test('nightSummary: deciding games of the night (a team at 2 wins)', () => {
  const rows = section('Avgjørende spill');
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^Frode: 1 spill, 1 S, 0 U, 0 T \(100\s%\sseier\)$/);
  assert.match(rows[3], /^Tor: 1 spill, 0 S, 0 U, 1 T \(0\s%\sseier\)$/);
});

test('nightSummary: the night\'s pairs with games, W/D/L and kjemi', () => {
  const rows = section('Kveldens par');
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^Frode og Hans: 3 spill, 3 S, 0 U, 0 T, kjemi [+−]?\d+$/);
});

test('nightSummary: every record present that night, absent ones left out', () => {
  assert.deepEqual(section('Rekorder'), [
    'Lengste sett: 3 spill (Sett 1: Hans og Frode 3–0 Tor og Per)',
    'Flest uavgjort i ett sett: 1 uavgjort (Sett 2: Hans og Tor 0–1 Frode og Per)',
    'Lengste seiersrekke: 4 spill (Frode)',
    'Lengste uavgjort-rekke: 1 spill',
    'Rene seire (3–0): 1 (Frode 1, Hans 1)',
  ]);
});

test('nightSummary: the season so far: league table and the Elo leaderboard with the change this season', () => {
  const league = section('Ligatabell');
  assert.equal(league[0], '1. Frode: 3 poeng (1 kveld, 1 sett vunnet)');
  assert.equal(league.length, 5);
  const elo = section('Rating og endring i sesongen');
  assert.equal(elo.length, 4, 'only players with games or penalties this season');
  assert.match(elo[0], /^1\. Frode: \d+( · ny)? \(\+\d+, 5 spill\)$/);
});

test('nightSummary: ends with the links to the night page and the stats overview of the season', () => {
  assert.deepEqual(lines().slice(-2), [
    'Se hele kvelden: https://sjineser.rodland.no/#/stats/night/2026-10-14',
    'All statistikk: https://sjineser.rodland.no/#/stats?s=2026-2',
  ]);
});

test('nightSummary: a night without games says so and still links to the page', () => {
  const empty = dataset({ players: [...FOUR, 'Kari'].map((name) => ({ name, active: true })), nights: [{ date: DATE, players: FOUR }] });
  const { text } = summary({}, empty);
  assert.ok(!text.includes('Rekorder'));
  assert.ok(!text.includes('Kveldens rangering'));
  assert.ok(text.includes('Ingen spill denne kvelden.'));
  assert.ok(text.includes('/#/stats/night/2026-10-14'));
});

test('nightSummaryData: the talking point falls back to a comeback, then the longest set', () => {
  // No streak of 3, no clean sweep, no comeback (A, B, A, B, A: A led first) → the longest set.
  const data = dataset({
    players: FOUR.map((name) => ({ name, active: true })),
    nights: [{ date: DATE, players: FOUR }],
    matches: [{ matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' }],
    games: ['A', 'B', 'A', 'B', 'A'].map((r, i) => game(MATCH_1, i + 1, r)),
  });
  assert.equal(nightSummaryData(...facts(data), DATE).highlight, 'Sett 1 varte i 5 spill.');
  const comeback = { ...data, games: ['B', 'B', 'A', 'A', 'A'].map((r, i) => game(MATCH_1, i + 1, r)) };
  assert.equal(nightSummaryData(...facts(comeback), DATE).highlight, 'Frode og Hans vant 3 spill på rad.');
  const twoAll = { ...data, games: ['B', 'B', 'A', 'D', 'A', 'D', 'A'].map((r, i) => game(MATCH_1, i + 1, r)) };
  assert.equal(nightSummaryData(...facts(twoAll), DATE).highlight, 'Frode og Hans snudde 0–2 til 3–2.');
});

test('nightSummary: the HTML is a complete document built from the same data', () => {
  const { html, text } = summary();
  assert.match(html, /^<!doctype html>/);
  for (const line of ['Kveldens vinner', 'Frode vant 4 spill på rad.', 'Avgjørende spill', 'Kveldens par', 'Ligatabell']) {
    assert.ok(html.includes(line), line);
    assert.ok(text.includes(line), line);
  }
  assert.ok(html.includes('href="https://sjineser.rodland.no/#/stats/night/2026-10-14"'));
  assert.ok(html.includes('href="https://sjineser.rodland.no/#/stats?s=2026-2"'));
});

test('nightSummary: names are escaped in the HTML', () => {
  const { html } = summary({}, night('K<i>&ri'));
  assert.ok(!html.includes('K<i>&ri'));
  assert.ok(html.includes('K&lt;i&gt;&amp;ri'));
});
