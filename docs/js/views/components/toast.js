import { h } from './dom.js';

const TOAST_MS = 3500;

/** @param {string} message */
export function showToast(message) {
  const toast = h('div', { class: 'toast', role: 'status' }, message);
  document.getElementById('toasts').append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}
