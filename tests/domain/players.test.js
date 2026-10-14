import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePlayers, findPlayer, nameFormatError, validateNewName } from '../../docs/js/domain/players.js';

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
