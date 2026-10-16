import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { statTile } from './tile.js';

/** @typedef {'W' | 'D' | 'L'} Outcome */

/** S/U/T per game, oldest first. @param {Outcome[]} outcomes @returns {string[]} */
export const formLetters = (outcomes) => outcomes.map((outcome) => t.statsColumns[outcome]);

/** "Siste 10: 4 seire, 3 uavgjort, 3 tap". @param {Outcome[]} outcomes */
export function formLabel(outcomes) {
  const counts = { W: 0, D: 0, L: 0 };
  for (const outcome of outcomes) counts[outcome] += 1;
  return t.statsUi.form(outcomes.length, counts);
}

/**
 * A row of S/U/T chips in the outcome colours, oldest left, newest right; read as one summary.
 * @param {Outcome[]} outcomes at least one
 * @param {{ compact?: boolean }} [options] compact: the smaller chips of a table cell
 */
export const formStrip = (outcomes, { compact = false } = {}) =>
  h('span', { class: compact ? 'form form-compact' : 'form', role: 'img', 'aria-label': formLabel(outcomes) },
    outcomes.map((outcome) => h('span', { class: 'form-chip', 'data-outcome': outcome }, t.statsColumns[outcome])));

/** @returns {{ el: HTMLElement }} */
export const renderForm = (stat, value, { hideTitle } = {}) =>
  ({ el: statTile(stat, value && formStrip(value.outcomes), { hideTitle }) });
