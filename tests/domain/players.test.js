import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activePlayers, findPlayer, hasHistory, nameFormatError, playerOverview, validateNewName, validateRename,
} from '../../docs/js/domain/players.js';

const players = [
  { name: 'Hans', active: true },
  { name: 'Åse', active: true },
  { name: 'Ærlend', active: true },
  { name: 'Ola', active: true },
  { name: 'Gamle', active: false },
];

test('findPlayer is case-insensitive and ignores surrounding space', () => {
  assert.equal(findPlayer(players, '  hANS ').name, 'Hans');
  assert.equal(findPlayer(players, 'Nobody'), null);
});

test('nameFormatError rejects empty, comma and plus names', () => {
  assert.equal(nameFormatError('   '), 'empty');
  assert.equal(nameFormatError('Per, Pål'), 'comma');
  assert.equal(nameFormatError('Per+Pål'), 'plus');
  assert.equal(nameFormatError(' Kari '), null);
});

test('validateNewName also rejects duplicates', () => {
  assert.equal(validateNewName('hans', players), 'duplicate');
  assert.equal(validateNewName('Kari', players), null);
  assert.equal(validateNewName('Ka+ri', players), 'plus');
});

test('activePlayers drops inactive and sorts in Norwegian order', () => {
  assert.deepEqual(activePlayers(players).map((p) => p.name), ['Hans', 'Ola', 'Ærlend', 'Åse']);
});

test('validateRename allows another casing of the same player but not another player', () => {
  assert.equal(validateRename('Hans', 'HANS', players), null);
  assert.equal(validateRename('Hans', 'Johannes', players), null);
  assert.equal(validateRename('Hans', 'ola', players), 'duplicate');
  assert.equal(validateRename('Hans', ' ', players), 'empty');
  assert.equal(validateRename('Hans', 'Jo,hannes', players), 'comma');
});

const history = {
  players: [{ name: 'Hans', active: true }, { name: 'Per', active: false }, { name: 'Kari', active: true }, { name: 'Ola', active: true },
    { name: 'Tor', active: true }, { name: 'Frode', active: true }],
  nights: [{ date: '2026-09-01', players: ['Hans', 'Per', 'Tor', 'Frode', 'Ola'] }, { date: '2026-10-14', players: ['Hans', 'Per', 'Tor', 'Frode'] }],
  matches: [
    { matchId: '2026-09-01#1', date: '2026-09-01', A1: 'Hans', A2: 'Per', B1: 'Tor', B2: 'Frode' },
    { matchId: '2026-10-14#1', date: '2026-10-14', A1: 'Hans', A2: 'Tor', B1: 'Per', B2: 'Frode' },
    { matchId: '2026-10-14#2', date: '2026-10-14', A1: 'Per', A2: 'Tor', B1: 'Hans', B2: 'Frode' },
  ],
  games: [
    { matchId: '2026-09-01#1', gameNo: 1, result: 'A', timestamp: 'T' },
    { matchId: '2026-09-01#1', gameNo: 2, result: 'D', timestamp: 'T' },
    { matchId: '2026-10-14#1', gameNo: 1, result: 'B', timestamp: 'T' },
  ],
};
const byPlayer = Object.fromEntries(playerOverview(history).map((p) => [p.name, p]));

test('playerOverview: counts games played and the last date a game was played', () => {
  assert.deepEqual(byPlayer.Hans, { name: 'Hans', active: true, games: 3, lastPlayed: '2026-10-14', deletable: false });
  assert.deepEqual(byPlayer.Per, { name: 'Per', active: false, games: 3, lastPlayed: '2026-10-14', deletable: false });
});

test('playerOverview: a player only on a roster has no games but cannot be deleted', () => {
  assert.deepEqual(byPlayer.Ola, { name: 'Ola', active: true, games: 0, lastPlayed: null, deletable: false });
});

test('playerOverview: a player without history can be deleted', () => {
  assert.deepEqual(byPlayer.Kari, { name: 'Kari', active: true, games: 0, lastPlayed: null, deletable: true });
});

test('hasHistory looks at rosters and seats, exact names', () => {
  assert.equal(hasHistory(history, 'Ola'), true);
  assert.equal(hasHistory(history, 'Kari'), false);
  assert.equal(hasHistory({ nights: [], matches: [history.matches[0]] }, 'Frode'), true);
});

test('playerOverview counts a third seat; empty seats count for nobody', () => {
  const ds = {
    players: [{ name: 'Hans', active: true }, { name: 'Kari', active: true }],
    nights: [],
    matches: [{ matchId: '2026-10-14#1', date: '2026-10-14', A1: 'Hans', A2: 'Per', A3: 'Kari', B1: 'Tor', B2: 'Frode', B3: '' }],
    games: [{ matchId: '2026-10-14#1', gameNo: 1, result: 'A', timestamp: 'T' }],
  };
  const overview = playerOverview(ds);
  assert.deepEqual(overview.map((p) => [p.name, p.games, p.deletable]), [['Hans', 1, false], ['Kari', 1, false]]);
  assert.equal(hasHistory(ds, ''), false);
});
