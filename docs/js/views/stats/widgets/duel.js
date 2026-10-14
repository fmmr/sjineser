import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { statTile } from './tile.js';

/**
 * Head-to-head: "Anne 32 — 12 Erik" in the compare colours (left = A, right = B), the draws
 * underneath, and a bar split left wins / draws / right wins.
 * @param {{ left: { name: string, wins: number }, right: { name: string, wins: number }, draws: number }} value
 */
export function duelBody({ left, right, draws }) {
  const total = left.wins + draws + right.wins;
  const segment = (side, count) => {
    const el = h('span', { class: 'duel-segment', 'data-side': side });
    el.style.setProperty('--share', String(total ? count / total : 0));
    return el;
  };
  const sideEl = (side, { name, wins }) =>
    h('div', { class: 'duel-side', 'data-side': side },
      h('span', { class: 'duel-name' }, name),
      h('span', { class: 'duel-wins' }, String(wins)));
  return h('div', { class: 'duel' },
    h('div', { class: 'duel-score', 'aria-label': t.statsUi.duel(left, right, draws) },
      sideEl('A', left), sideEl('B', right)),
    h('div', { class: 'duel-bar', 'aria-hidden': 'true' }, segment('A', left.wins), segment('D', draws), segment('B', right.wins)),
    h('p', { class: 'duel-draws' }, t.statsUi.draws(draws)));
}

/** @returns {{ el: HTMLElement }} */
export const renderDuel = (stat, value, { hideTitle } = {}) => ({ el: statTile(stat, value && duelBody(value), { hideTitle }) });
