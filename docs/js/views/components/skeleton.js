import { h } from './dom.js';
import { t } from '../../i18n/nb.js';

/**
 * Placeholder shapes shown before the first data arrives, in place of a "loading" text.
 * They mirror the real layout so nothing jumps; screen readers hear the loading text.
 */

/** @param {'label' | 'title' | 'value' | 'line' | 'button' | 'chart'} size */
const bar = (size) => h('span', { class: 'skeleton-bar', 'data-size': size });

/** Marks the placeholder busy and gives it an accessible loading message. */
const frame = (tag, props, ...children) =>
  h(tag, { ...props, 'aria-busy': 'true' }, h('span', { class: 'visually-hidden', role: 'status' }, t.loading), children);

/** Stand-in for the home screen's night card. */
export const nightCardSkeleton = () =>
  frame('div', { class: 'card stack skeleton' }, bar('label'), bar('title'), bar('button'));

/** Stand-in for a stats page: title, a row of headline numbers and a chart. */
export const statsSkeleton = () =>
  frame('div', { class: 'stats-page skeleton' },
    bar('title'),
    h('div', { class: 'stat-grid' }, [1, 2].map(() => h('div', { class: 'stat-tile' }, bar('label'), bar('value')))),
    bar('chart'));
