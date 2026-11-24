import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeagues } from '../../docs/js/state/leagues.js';

function memory(initial = {}) {
  const items = { ...initial };
  return { items, getItem: (k) => items[k] ?? null, setItem: (k, v) => { items[k] = v; } };
}
const found = (name) => async () => ({ ok: true, name });

test('a new phone knows only the main league, and it is the current one', () => {
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: found('x') });
  assert.deepEqual(leagues.list(), [{ id: 'main', name: 'Sjineser' }]);
  assert.equal(leagues.current(), 'main');
  assert.equal(leagues.nameOf('main'), 'Sjineser');
  assert.equal(leagues.nameOf('unknown-id'), 'unknown-id', 'an unknown league is shown by its code');
});

test('select is remembered (also by another instance on the same storage)', () => {
  const backend = memory();
  const a = createLeagues({ backend, mainName: 'Sjineser', check: found('x') });
  a.select('hp-k7x2');
  assert.equal(createLeagues({ backend, mainName: 'Sjineser', check: found('x') }).current(), 'hp-k7x2');
});

test('remember adds a league after the main one, renames it, ignores blank names; the main league takes the name the server gives', () => {
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: found('x') });
  leagues.remember('hp-k7x2', 'Familie');
  leagues.remember('abc-123', 'Venner');
  leagues.remember('hp-k7x2', 'Familie-kineser');
  leagues.remember('zzz-999', '  ');
  leagues.remember('main', '  ');
  assert.equal(leagues.nameOf('main'), 'Sjineser');
  leagues.remember('main', 'Gutta');
  assert.deepEqual(leagues.list().map((l) => [l.id, l.name]),
    [['main', 'Gutta'], ['abc-123', 'Venner'], ['hp-k7x2', 'Familie-kineser']]);
});

test('subscribers hear about a new or changed name, not about repeats', () => {
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: found('x') });
  let heard = 0;
  const stop = leagues.subscribe(() => { heard += 1; });
  leagues.remember('hp-k7x2', 'Familie');
  leagues.remember('hp-k7x2', 'Familie');
  leagues.remember('hp-k7x2', 'Familie 2');
  assert.equal(heard, 2);
  stop();
  leagues.remember('hp-k7x2', 'Familie 3');
  assert.equal(heard, 2);
});

test('damaged saved state falls back to the main league', () => {
  for (const raw of ['{', 'null', '{"current":42,"leagues":"x"}', '{"leagues":[{"id":"PIN","name":"x"},{"id":"abc-123"}]}']) {
    const leagues = createLeagues({ backend: memory({ 'sjineser-leagues': raw }), mainName: 'Sjineser', check: found('x') });
    assert.equal(leagues.current(), 'main', raw);
    assert.deepEqual(leagues.list(), [{ id: 'main', name: 'Sjineser' }], raw);
  }
});

test('join: a link or code of an existing league is remembered with the name the server gave', async () => {
  const asked = [];
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: async (id) => { asked.push(id); return { ok: true, name: 'Familie' }; } });
  assert.deepEqual(await leagues.join('https://sjineser.rodland.no/?l=Hp-K7x2#/play'), { ok: true, id: 'hp-k7x2' });
  assert.deepEqual(asked, ['hp-k7x2']);
  assert.equal(leagues.nameOf('hp-k7x2'), 'Familie');
});

test('join: nonsense is rejected without asking; unknown and unreachable leagues are told apart; nothing unverified is listed', async () => {
  const replies = [{ ok: false, error: 'invalid' }, { ok: false, error: 'network' }];
  let asked = 0;
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: async () => { asked += 1; return replies.shift(); } });
  assert.deepEqual(await leagues.join('hi'), { ok: false, error: 'badCode' });
  assert.equal(asked, 0);
  assert.deepEqual(await leagues.join('hp-k7x2'), { ok: false, error: 'unknown' });
  assert.deepEqual(await leagues.join('hp-k7x2'), { ok: false, error: 'network' });
  assert.deepEqual(leagues.list(), [{ id: 'main', name: 'Sjineser' }]);
});

test('join: the main league needs no check', async () => {
  const leagues = createLeagues({ backend: memory(), mainName: 'Sjineser', check: async () => { throw new Error('not asked'); } });
  assert.deepEqual(await leagues.join('main'), { ok: true, id: 'main' });
});
