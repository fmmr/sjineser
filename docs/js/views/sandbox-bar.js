import { h } from './components/dom.js';
import { t } from '../i18n/nb.js';

/**
 * Shows the TESTMODUS bar: pretend date, reset of the generated data, and a way out.
 * @param {{
 *   clock: ReturnType<typeof import('../state/clock.js').createClock>,
 *   api: { reset: () => void },
 *   storage: ReturnType<typeof import('../state/storage.js').createStorage>,
 *   onDateChange: () => void,
 * }} options
 */
export function mountSandboxBar({ clock, api, storage, onDateChange }) {
  const bar = document.getElementById('sandbox-bar');
  document.body.classList.add('sandbox');
  bar.hidden = false;

  const dateInput = h('input', {
    class: 'sandbox-date',
    type: 'date',
    value: clock.today(),
    'aria-label': t.sandbox.date,
    onchange: () => {
      clock.setToday(dateInput.value);
      dateInput.value = clock.today();
      onDateChange();
    },
  });

  function reset() {
    if (!window.confirm(t.sandbox.resetConfirm)) return;
    api.reset();
    storage.set('outbox', []);
    storage.set('dataset', null);
    location.reload();
  }

  // The current route is read on click, so leaving keeps the page you are on.
  const exit = h('a', {
    class: 'sandbox-exit',
    href: location.pathname,
    onclick: () => { exit.href = location.pathname + location.hash; },
  }, t.sandbox.exit);

  bar.replaceChildren(
    h('span', { class: 'sandbox-label' }, t.sandbox.label),
    dateInput,
    h('button', { class: 'sandbox-reset', type: 'button', onclick: reset }, t.sandbox.reset),
    exit,
  );
}
