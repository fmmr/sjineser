import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsHref, subjectPath } from '../../../docs/js/views/stats/links.js';
import { compareSubject, overallSubject, pairSubject, playerSubject } from '../../../docs/js/domain/stats/subjects.js';

test('subjectPath encodes æøå, spaces and slashes in names', () => {
  assert.equal(subjectPath(playerSubject('Bjørn Åge')), '/stats/player/Bj%C3%B8rn%20%C3%85ge');
  assert.equal(subjectPath(playerSubject('A/B')), '/stats/player/A%2FB');
  assert.equal(subjectPath(pairSubject('Æsa', 'Bjørn')), '/stats/pair/Bj%C3%B8rn+%C3%86sa');
  assert.equal(subjectPath(compareSubject('Per Ø', 'x/y')), '/stats/compare/Per%20%C3%98/x%2Fy');
  assert.equal(subjectPath(overallSubject()), '/stats');
});

test('subjectPath round-trips through decodeURIComponent', () => {
  const name = 'Øystein / Å';
  const [, , , encoded] = subjectPath(playerSubject(name)).split('/');
  assert.equal(decodeURIComponent(encoded), name);
});

test('statsHref keeps only the season filter of the query', () => {
  assert.equal(statsHref('/stats/pairs', { s: '2026-1', sandbox: '1', foo: 'bar' }), '#/stats/pairs?s=2026-1');
  assert.equal(statsHref('/stats', { foo: 'bar' }), '#/stats');
  assert.equal(statsHref('/stats', {}), '#/stats');
});
