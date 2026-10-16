import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectorOptions, selectorTarget } from '../../../docs/js/views/stats/selector-bar.js';
import { t } from '../../../docs/js/i18n/nb.js';
import { dataset, game } from '../../helpers.js';

const DATE = '2026-03-02';
const DATA = dataset({
  players: ['Åse', 'Bjørn', 'Ola', 'Anne', 'Zorro', 'Benk'].map((name) => ({ name, active: true })),
  nights: [{ date: DATE, players: ['Åse', 'Bjørn', 'Ola', 'Anne', 'Zorro', 'Benk'] }],
  matches: [
    { matchId: 'm1', date: DATE, A1: 'Åse', A2: 'Bjørn', B1: 'Ola', B2: 'Anne' },
    { matchId: 'm2', date: DATE, A1: 'Zorro', A2: 'Ola', B1: 'Anne', B2: 'Bjørn' },
  ],
  games: [game('m1', 1, 'A')],
});
const TODAY = '2026-10-14';
const ALL = { kind: 'all' };
const values = (select) => select.options.map((o) => o.value);

test('player options: everyone who has played a game, Norwegian order, after an empty placeholder', () => {
  const { player } = selectorOptions(DATA, { filter: ALL, today: TODAY });
  assert.deepEqual(values(player), ['', 'Anne', 'Bjørn', 'Ola', 'Åse']);
  assert.equal(player.options[0].label, t.statsUi.choosePlayer);
  assert.equal(player.selected, '');
});

test('player options: the current player is selected', () => {
  assert.equal(selectorOptions(DATA, { player: 'Ola', filter: ALL, today: TODAY }).player.selected, 'Ola');
});

test('player options: a current player without games is still listed and selected', () => {
  const { player } = selectorOptions(DATA, { player: 'Benk', filter: ALL, today: TODAY });
  assert.deepEqual(values(player), ['', 'Anne', 'Benk', 'Bjørn', 'Ola', 'Åse']);
  assert.equal(player.selected, 'Benk');
});

test('compare options: disabled and empty without a player', () => {
  const { other } = selectorOptions(DATA, { filter: ALL, today: TODAY });
  assert.equal(other.disabled, true);
  assert.deepEqual(values(other), ['']);
  assert.equal(other.options[0].label, t.statsUi.noCompare);
});

test('compare options: the others, empty by default, the player left out', () => {
  const { other } = selectorOptions(DATA, { player: 'Bjørn', filter: ALL, today: TODAY });
  assert.equal(other.disabled, false);
  assert.deepEqual(values(other), ['', 'Anne', 'Ola', 'Åse']);
  assert.equal(other.selected, '');
});

test('compare page: the other player is selected and left out of the player list', () => {
  const { player, other } = selectorOptions(DATA, { player: 'Bjørn', other: 'Ola', filter: ALL, today: TODAY });
  assert.deepEqual(values(player), ['', 'Anne', 'Bjørn', 'Åse']);
  assert.equal(player.selected, 'Bjørn');
  assert.deepEqual(values(other), ['', 'Anne', 'Ola', 'Åse']);
  assert.equal(other.selected, 'Ola');
});

test('season options: chronological, then all; all selected without a season', () => {
  const { season } = selectorOptions(DATA, { filter: ALL, today: TODAY });
  assert.deepEqual(values(season), ['2026-1', '2026-2', 'all']);
  assert.equal(season.selected, 'all');
});

test('season options: a season outside the list is added before all and selected', () => {
  const { season } = selectorOptions(DATA, { filter: { kind: 'season', year: 2020, half: 1 }, today: TODAY });
  assert.deepEqual(values(season), ['2026-1', '2026-2', '2020-1', 'all']);
  assert.equal(season.selected, '2020-1');
});

test('target: player page, compare page, or the empty player page; only the season is kept', () => {
  const query = { s: '2026-1', other: 'x' };
  assert.equal(selectorTarget({ player: 'Bjørn Å' }, query), '#/stats/player/Bj%C3%B8rn%20%C3%85?s=2026-1');
  assert.equal(selectorTarget({ player: 'Ola', other: 'Anne' }, query), '#/stats/compare/Ola/Anne?s=2026-1');
  assert.equal(selectorTarget({ player: 'Ola', other: '' }, {}), '#/stats/player/Ola');
  assert.equal(selectorTarget({ player: '' }, {}), '#/stats/player');
  assert.equal(selectorTarget({ player: '', other: 'Anne' }, { s: 'all' }), '#/stats/player?s=all');
});

test('target: the same player twice is the player page', () => {
  assert.equal(selectorTarget({ player: 'Ola', other: 'Ola' }, {}), '#/stats/player/Ola');
});
