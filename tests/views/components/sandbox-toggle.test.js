import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandboxUrl } from '../../../docs/js/views/components/sandbox-toggle.js';

test('sandboxUrl switches test mode on and off and keeps the current screen', () => {
  assert.equal(sandboxUrl({ pathname: '/', hash: '#/stats/player/Anne' }, true), '/?sandbox#/stats/player/Anne');
  assert.equal(sandboxUrl({ pathname: '/', hash: '#/play' }, false), '/#/play');
  assert.equal(sandboxUrl({ pathname: '/app/', hash: '' }, true), '/app/?sandbox');
});
