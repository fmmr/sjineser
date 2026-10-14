import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../../docs/js/state/storage.js';
import { memoryBackend } from '../../helpers.js';
import { askForPin, defaultAsk, supportsSheets } from '../../../docs/js/views/components/pin-prompt.js';
import { pinSheet } from '../../../docs/js/views/components/sheet.js';

/** An ask() that resolves when the test says so, counting calls. */
function controlledAsk() {
  const calls = [];
  const ask = () => new Promise((resolve) => calls.push(resolve));
  return { ask, calls };
}

function setup() {
  const storage = createStorage(memoryBackend());
  let resumed = 0;
  const outbox = { resume: () => { resumed += 1; } };
  return { storage, outbox, resumed: () => resumed };
}

test('askForPin stores the trimmed PIN and resumes the outbox', async () => {
  const { storage, outbox, resumed } = setup();
  const { ask, calls } = controlledAsk();
  const done = askForPin({ storage, outbox, ask });
  calls[0](' 1234 ');
  await done;
  assert.equal(storage.get('pin'), '1234');
  assert.equal(resumed(), 1);
});

test('askForPin does nothing on cancel or an empty PIN', async () => {
  for (const answer of [null, '', '   ']) {
    const { storage, outbox, resumed } = setup();
    const { ask, calls } = controlledAsk();
    const done = askForPin({ storage, outbox, ask });
    calls[0](answer);
    await done;
    assert.equal(storage.get('pin', 'none'), 'none');
    assert.equal(resumed(), 0);
  }
});

test('askForPin does not open a second sheet while one is open', async () => {
  const { storage, outbox, resumed } = setup();
  const { ask, calls } = controlledAsk();
  const first = askForPin({ storage, outbox, ask });
  const second = askForPin({ storage, outbox, ask });
  assert.equal(calls.length, 1);
  calls[0]('42');
  await Promise.all([first, second]);
  assert.equal(resumed(), 1);

  const third = askForPin({ storage, outbox, ask });
  assert.equal(calls.length, 2, 'asks again once the first sheet is closed');
  calls[1](null);
  await third;
});

test('askForPin asks again after a failed sheet', async () => {
  const { storage, outbox } = setup();
  let calls = 0;
  const failing = () => {
    calls += 1;
    return Promise.reject(new Error('no sheet'));
  };
  await assert.rejects(askForPin({ storage, outbox, ask: failing }));
  await assert.rejects(askForPin({ storage, outbox, ask: failing }));
  assert.equal(calls, 2);
});

test('the PIN sheet needs <dialog> with showModal; otherwise window.prompt is used', async () => {
  class WithModal {}
  WithModal.prototype.showModal = () => {};
  assert.equal(supportsSheets({ HTMLDialogElement: WithModal }), true);
  assert.equal(supportsSheets({ HTMLDialogElement: class {} }), false);
  assert.equal(supportsSheets({}), false);

  const asked = [];
  const ask = defaultAsk({ win: {}, prompt: (message) => { asked.push(message); return '77'; } });
  assert.equal(await ask(), '77');
  assert.equal(asked.length, 1);
  assert.equal(defaultAsk({ win: { HTMLDialogElement: WithModal } }), pinSheet);
});
