import { h } from './dom.js';

const TOAST_MS = 3500;

/**
 * A short message above the tab bar. With an `action` the toast stays until its button is
 * tapped (used for "new version — reload").
 * @param {string} message
 * @param {{ action?: { label: string, onClick: () => void } }} [options]
 */
export function showToast(message, { action } = {}) {
  const toast = h('div', { class: action ? 'toast toast-action' : 'toast', role: 'status' },
    h('span', {}, message),
    action && h('button', { class: 'toast-button', type: 'button', onclick: action.onClick }, action.label));
  document.getElementById('toasts').append(toast);
  if (!action) setTimeout(() => toast.remove(), TOAST_MS);
}
