import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryActions, summarySentText } from '../../../docs/js/views/stats/night.js';

test('summarySentText: when the summary went out, in local time; nothing when not sent', () => {
  assert.equal(summarySentText(new Date(2026, 10, 10, 21, 3).toISOString()), 'Oppsummering sendt 10. nov. kl. 21:03');
  assert.equal(summarySentText(''), null);
  assert.equal(summarySentText(undefined), null);
  assert.equal(summarySentText('i går'), 'Oppsummering sendt (i går)');
});

test('summaryActions: not sent yet → Send, test send and cancel, Send focused', () => {
  const { actions, focusIndex } = summaryActions('');
  assert.deepEqual(actions.map((a) => [a.value, Boolean(a.disabled)]), [['all', false], ['test', false], [null, false]]);
  assert.equal(focusIndex, 0);
});

test('summaryActions: already sent → Send disabled, the test send still available and focused', () => {
  const { actions, focusIndex } = summaryActions('2026-11-10T20:03:00.000Z');
  assert.deepEqual(actions.map((a) => [a.value, Boolean(a.disabled)]), [['all', true], ['test', false], [null, false]]);
  assert.equal(focusIndex, 1);
});
