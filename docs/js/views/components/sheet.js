import { h } from './dom.js';
import { t } from '../../i18n/nb.js';

/**
 * Bottom sheets replace the browser's prompt/confirm: a panel slides up over a dimmed
 * backdrop (a modal <dialog>, so the page behind is inert), focus stays inside, and
 * Escape, a tap on the backdrop or leaving the page closes it as "cancel".
 */

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
/** Upper bound for the closing animation, in case animationend never fires. */
const CLOSE_FALLBACK_MS = 300;

let sheetCount = 0;

/**
 * Where Tab should move focus to keep it inside the sheet, or null to let the browser move it.
 * @param {number} index position of the focused element among the focusables, -1 if outside
 * @param {number} count number of focusable elements in the sheet
 * @param {boolean} backwards Shift+Tab
 * @returns {number | null}
 */
export function wrapFocus(index, count, backwards) {
  if (count === 0) return null;
  if (index === -1) return backwards ? count - 1 : 0;
  if (backwards && index === 0) return count - 1;
  if (!backwards && index === count - 1) return 0;
  return null;
}

/**
 * @typedef {object} SheetAction
 * @property {string} label
 * @property {any | (() => any)} value what the sheet resolves to; a function is called on close
 * @property {'primary' | 'danger' | 'ghost'} [variant]
 * @property {boolean} [submit] also chosen by Enter in a field
 */

/**
 * Opens a bottom sheet.
 * @param {{ title: string, message?: string, body?: Node[], actions: SheetAction[],
 *   cancelValue?: any, initialFocus?: (panel: HTMLElement) => HTMLElement | null }} options
 *   cancelValue: result of Escape, backdrop tap or navigation; initialFocus: the element to
 *   focus first (default: the first action)
 * @returns {Promise<any>} the chosen action's value, or cancelValue
 */
export function openSheet({ title, message, body = [], actions, cancelValue, initialFocus }) {
  const returnFocus = document.activeElement;
  const titleId = `sheet-title-${(sheetCount += 1)}`;
  let settled = false;
  let resolveSheet;
  const result = new Promise((resolve) => { resolveSheet = resolve; });

  const buttons = actions.map((action) =>
    h('button', {
      class: `btn btn-${action.variant ?? 'ghost'}`,
      type: action.submit ? 'submit' : 'button',
      onclick: action.submit ? null : () => close(action.value),
    }, action.label));

  const panel = h('form', { class: 'sheet-panel', novalidate: true, onsubmit: onSubmit },
    h('span', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('h2', { class: 'sheet-title', id: titleId }, title),
    message && h('p', { class: 'sheet-message' }, message),
    body,
    h('div', { class: 'sheet-actions' }, buttons));

  const dialog = h('dialog', {
    class: 'sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    oncancel: (event) => {
      event.preventDefault();
      close(cancelValue);
    },
    // Taps on the dimmed area hit the dialog itself; taps on the panel hit its children.
    onclick: (event) => {
      if (event.target === dialog) close(cancelValue);
    },
    onkeydown: trapTab,
  }, panel);

  function onSubmit(event) {
    event.preventDefault();
    const index = buttons.indexOf(event.submitter);
    const action = index >= 0 ? actions[index] : actions.find((a) => a.submit);
    if (action) close(action.value);
  }

  function trapTab(event) {
    if (event.key !== 'Tab') return;
    const focusables = [...panel.querySelectorAll(FOCUSABLE)];
    const target = wrapFocus(focusables.indexOf(document.activeElement), focusables.length, event.shiftKey);
    if (target === null) return;
    event.preventDefault();
    focusables[target].focus();
  }

  function close(value) {
    if (settled) return;
    settled = true;
    window.removeEventListener('hashchange', onNavigate);
    resolveSheet(typeof value === 'function' ? value() : value);
    dialog.dataset.closing = '';
    const finish = () => {
      if (!dialog.isConnected) return;
      dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    panel.addEventListener('animationend', (event) => {
      if (event.target === panel) finish();
    });
    setTimeout(finish, CLOSE_FALLBACK_MS);
  }

  const onNavigate = () => close(cancelValue);
  window.addEventListener('hashchange', onNavigate);

  document.body.append(dialog);
  dialog.showModal();
  (initialFocus?.(panel) ?? buttons[0])?.focus();
  return result;
}

/**
 * Asks a yes/no question.
 * @param {{ title: string, message?: string, confirmLabel: string, cancelLabel?: string, destructive?: boolean }} options
 * @returns {Promise<boolean>}
 */
export function confirmSheet({ title, message, confirmLabel, cancelLabel = t.sheet.cancel, destructive = false }) {
  return openSheet({
    title,
    message,
    actions: [
      { label: confirmLabel, value: true, variant: destructive ? 'danger' : 'primary' },
      { label: cancelLabel, value: false, variant: 'ghost' },
    ],
    cancelValue: false,
  });
}

/**
 * Asks for the shared PIN; Enter submits.
 * @returns {Promise<string | null>} what was typed, or null when cancelled
 */
export function pinSheet() {
  const input = h('input', {
    class: 'field sheet-field',
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': t.pin.label,
  });
  return openSheet({
    title: t.pin.title,
    message: t.pin.message,
    body: [input],
    actions: [
      { label: t.pin.save, value: () => input.value, variant: 'primary', submit: true },
      { label: t.sheet.cancel, value: null, variant: 'ghost' },
    ],
    cancelValue: null,
    initialFocus: () => input,
  });
}
