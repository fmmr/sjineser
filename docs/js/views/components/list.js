import { h } from './dom.js';
import { chevronIcon } from './icons.js';

/**
 * Grouped lists in the style of the iOS settings (more.css): a small heading above a card
 * with hairlines between the rows.
 * @param {string} id id of the heading, which labels the section
 * @param {string} heading
 * @param {Node[]} rows
 * @param {Node | null} [note] muted text below the card
 */
export const listGroup = (id, heading, rows, note = null) =>
  h('section', { class: 'list-group', 'aria-labelledby': id },
    h('h2', { class: 'list-heading', id }, heading),
    h('ul', { class: 'list-card' }, rows.map((row) => h('li', {}, row))),
    note);

/** Label with an optional muted line below it; `hint` is extra text for screen readers only. */
export const rowText = (label, sub, ids = {}, hint = null) =>
  h('span', { class: 'list-text' },
    h('span', { class: 'list-label', id: ids.label }, label, hint && h('span', { class: 'visually-hidden' }, hint)),
    sub && h('span', { class: 'list-sub', id: ids.sub }, sub));

/** A row that opens another screen of the app. */
export const linkRow = (href, label, sub = null) =>
  h('a', { class: 'list-row', href }, rowText(label, sub), h('span', { class: 'list-trail' }, chevronIcon()));
