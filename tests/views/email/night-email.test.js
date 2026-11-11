import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMAIL_COLORS, renderNightEmail } from '../../../docs/js/views/email/night-email.js';

const TOKENS = readFileSync(new URL('../../../docs/css/tokens.css', import.meta.url), 'utf8');

/** Hand-made email data: one finished and one unfinished set, a sitting-out player, records, a season. */
const DATA = {
  date: '2026-11-10',
  longDate: '10. nov. 2026',
  subject: 'Sjineser — kveld 10. nov. 2026',
  players: ['Anne', 'Bjørn', 'Cato', 'Dag', 'Eva'],
  winner: { name: 'Anne', gain: 87 },
  highlight: 'Anne vant 5 spill på rad.',
  sets: [
    { number: 1, A: ['Anne', 'Bjørn'], B: ['Cato', 'Dag'], score: { A: 3, B: 1, D: 2 }, winner: 'A', status: null },
    { number: 2, A: ['Anne', 'Cato'], B: ['Bjørn', 'Dag'], score: { A: 0, B: 1, D: 0 }, winner: null, status: 'unfinished' },
  ],
  leaderboard: [
    { rank: 1, player: 'Anne', rating: 1087, provisional: false, change: 87, games: 7, form: ['W', 'D', 'L'] },
    { rank: 2, player: 'Dag', rating: 960, provisional: true, change: -40, games: 7, form: ['L'] },
    { rank: 3, player: 'Eva', rating: 1000, provisional: false, change: null, games: 0, form: [] },
  ],
  decisive: [{ player: 'Anne', games: 2, W: 1, D: 1, L: 0, winRate: 0.5 }],
  pairs: [{ pair: ['Anne', 'Bjørn'], games: 6, W: 3, D: 2, L: 1, winRate: 0.5, chemistry: 0.08 }],
  records: [
    { title: 'Lengste sett', value: '6 spill', about: 'Sett 1: Anne og Bjørn 3–1 Cato og Dag' },
    { title: 'Lengste uavgjort-rekke', value: '2 spill', about: null },
  ],
  season: {
    label: 'Høst 2026',
    league: [{ rank: 1, player: 'Anne', nights: 4, setsWon: 6, points: 16 }],
    elo: [{ rank: 1, player: 'Anne', rating: 1087, provisional: false, change: 120, games: 30 }],
  },
  links: { night: 'https://sjineser.rodland.no/#/stats/night/2026-11-10', stats: 'https://sjineser.rodland.no/#/stats?s=2026-2' },
};

const html = renderNightEmail(DATA);

test('EMAIL_COLORS are the light theme tokens', () => {
  const light = TOKENS.slice(TOKENS.indexOf(':root[data-theme="light"]'));
  const token = (name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(light)[1].trim();
  const pairs = { bg: 'bg', surface: 'surface', surfaceRaised: 'surface-raised', text: 'text', textMuted: 'text-muted',
    accent: 'accent', teamA: 'team-a', teamB: 'team-b', draw: 'draw', danger: 'danger' };
  for (const [key, name] of Object.entries(pairs)) assert.equal(EMAIL_COLORS[key], token(name), name);
});

test('renderNightEmail: one self-contained document at most 600 px wide, nothing external', () => {
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes('max-width:600px'));
  assert.ok(!/<(img|link|script|style)\b/i.test(html));
  assert.ok(!/url\(/i.test(html));
});

test('renderNightEmail: the header with the night, who was there, the winner and the talking point', () => {
  assert.ok(html.includes('Kveld 10. nov. 2026'));
  assert.ok(html.includes('Med: Anne, Bjørn, Cato, Dag og Eva'));
  assert.ok(html.includes('Kveldens vinner: Anne'));
  assert.ok(html.includes('(+87)'));
  assert.ok(html.includes('Anne vant 5 spill på rad.'));
});

test('renderNightEmail: sets as scoreboards in the team colours, the winners bold', () => {
  assert.ok(html.includes('Sett 1 · 2 uavgjort'));
  assert.ok(html.includes('Sett 2 · ikke ferdig'));
  assert.match(html, new RegExp(`color:${EMAIL_COLORS.teamA};[^"]*font-weight:700">Anne og Bjørn<`));
  assert.match(html, new RegExp(`color:${EMAIL_COLORS.teamB};[^"]*font-weight:400">Cato og Dag<`));
  assert.ok(html.includes('>3–1<'));
});

test('renderNightEmail: the leaderboard with coloured changes, form chips and sitting out', () => {
  assert.match(html, new RegExp(`color:${EMAIL_COLORS.accent};font-weight:600">\\+87<`));
  assert.match(html, new RegExp(`color:${EMAIL_COLORS.danger};font-weight:600">−40<`));
  assert.ok(html.includes('960 · ny'));
  for (const [letter, color] of [['S', EMAIL_COLORS.accent], ['U', EMAIL_COLORS.draw], ['T', EMAIL_COLORS.danger]]) {
    assert.match(html, new RegExp(`background:${color};[^"]*">${letter}</span>`), letter);
  }
  assert.match(html, /colspan="3"[^>]*>sto over</);
});

test('renderNightEmail: decisive games, pairs with kjemi, records, the season and the links', () => {
  for (const text of ['Avgjørende spill', 'Kveldens par', 'Anne og Bjørn', '>+8<', 'Rekorder', 'Lengste sett', ' · Sett 1: Anne og Bjørn 3–1 Cato og Dag',
    'Lengste uavgjort-rekke', 'Høst 2026 så langt', 'Ligatabell', 'Rating og endring i sesongen', '>+120<']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes(`href="${DATA.links.night}"`));
  assert.ok(html.includes(`href="${DATA.links.stats}"`));
});

test('renderNightEmail: optional sections are left out; a night without games says so', () => {
  const bare = renderNightEmail({
    ...DATA, winner: null, highlight: null, sets: [], leaderboard: [], decisive: null, pairs: null, records: [],
    season: { label: 'Høst 2026', league: null, elo: null },
  });
  for (const text of ['Kveldens vinner', 'Kveldens rangering', 'Avgjørende spill', 'Kveldens par', 'Rekorder', 'så langt']) {
    assert.ok(!bare.includes(text), text);
  }
  assert.ok(bare.includes('Ingen spill denne kvelden.'));
  assert.ok(bare.includes(`href="${DATA.links.night}"`));
});
