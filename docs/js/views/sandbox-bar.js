import { h } from './components/dom.js';
import { t } from '../i18n/nb.js';

/**
 * Shows the TESTMODUS bar: pretend date, reset of the generated data, and a way out.
 * @param {{
 *   clock: ReturnType<typeof import('../state/clock.js').createClock>,
 *   onDateChange: () => void,
 *   onReset: () => void,
 *   minDate: () => string | null | undefined,
 * }} options minDate is the earliest allowed pretend date (the latest night), read when needed.
 */
export function mountSandboxBar({ clock, onDateChange, onReset, minDate }) {
  const bar = document.getElementById('sandbox-bar');
  document.body.classList.add('sandbox');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t.sandbox.label);
  bar.hidden = false;

  const dateInput = h('input', {
    class: 'sandbox-date',
    type: 'date',
    value: clock.today(),
    'aria-label': t.sandbox.date,
    onfocus: () => refresh(),
    onchange: () => {
      // A pretend date before the latest night would let new data precede old, so it is ignored.
      const min = minDate();
      if (!min || dateInput.value >= min) clock.setToday(dateInput.value);
      dateInput.value = clock.today();
      onDateChange();
    },
  });

  function reset() {
    if (window.confirm(t.sandbox.resetConfirm)) onReset();
  }

  // Leaving keeps the page you are on.
  const exit = h('a', { class: 'sandbox-exit' }, t.sandbox.exit);

  function refresh() {
    dateInput.min = minDate() ?? '';
    exit.href = location.pathname + location.hash;
  }

  bar.replaceChildren(
    h('span', { class: 'sandbox-label' }, t.sandbox.label),
    dateInput,
    h('button', { class: 'sandbox-reset', type: 'button', onclick: reset }, t.sandbox.reset),
    exit,
  );
  refresh();
  window.addEventListener('hashchange', refresh);
}
