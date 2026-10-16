import { h } from '../../components/dom.js';
import { t } from '../../../i18n/nb.js';
import { compareSubject, playerSubject } from '../../../domain/stats/subjects.js';
import { statsHref, subjectPath } from '../links.js';
import { formatValue } from './format.js';
import { statTile } from './tile.js';

/**
 * @typedef {{ W: number, D: number, L: number } | null} MatrixCell
 */

const ABBREVIATION_LENGTH = 3;

/** Column header text: the first three letters ('Bjørn' → 'Bjø'). @param {string} name */
export const abbreviate = (name) => Array.from(name).slice(0, ABBREVIATION_LENGTH).join('');

/** Wins over games, or null where they never met. @param {MatrixCell} cell @returns {number | null} */
export const winShare = (cell) => (cell ? cell.W / (cell.W + cell.D + cell.L) : null);

/** The shown, rounded percent (0–100). @param {MatrixCell} cell */
const shownPercent = (cell) => Math.round(winShare(cell) * 100);

/** A cell's text: the win share as a whole percent without the sign ('60'); '' where they never met. @param {MatrixCell} cell */
export const matrixCellText = (cell) => (cell ? formatValue(shownPercent(cell), 'int') : '');

/**
 * The tint of a cell: 'up' when the row player won more games than they lost against the column
 * player, 'down' when they lost more, null when even. Draws are neutral: with many draws a win
 * share well under 50 % can still be the better side of the duel. Strength 0 … 1 is the margin
 * of the decided games, |W − L| / (W + L). Null where they never met.
 * @param {MatrixCell} cell
 * @returns {{ tone: 'up' | 'down' | null, strength: number } | null}
 */
export function matrixTone(cell) {
  if (!cell) return null;
  const margin = cell.W - cell.L;
  const decided = cell.W + cell.L;
  return { tone: margin > 0 ? 'up' : margin < 0 ? 'down' : null, strength: decided ? Math.abs(margin) / decided : 0 };
}

/**
 * Player vs player grid: row headers are the players (linked to their page), column headers
 * their first three letters (full name as a tooltip), each cell the row player's win share
 * against the column player, tinted by who won more of their games (matrixTone). Tapping (or
 * hovering / focusing) a cell shows its full record under the grid — wins, draws and losses of
 * how many games — with a link to the compare page.
 * @param {{ players: string[], cells: MatrixCell[][] }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function matrixBody({ players, cells }, { query }) {
  const detail = h('p', { class: 'matrix-detail', 'aria-live': 'polite' }, t.statsUi.matrixHint);
  let selected = null;

  function show(td, row, col, wdl) {
    selected?.removeAttribute('data-selected');
    selected = td;
    td.setAttribute('data-selected', '');
    const href = statsHref(subjectPath(compareSubject(players[row], players[col])), query);
    detail.replaceChildren(
      h('span', {}, t.statsUi.matrixCell(players[row], players[col], wdl)), ' ',
      h('a', { class: 'link', href }, t.statsUi.matrixCompare));
  }

  const cell = (row, col, wdl) => {
    if (row === col || !wdl) return h('td', { class: 'matrix-cell', 'data-empty': row === col ? 'self' : 'none' });
    const label = t.statsUi.matrixCell(players[row], players[col], wdl);
    const { tone, strength } = matrixTone(wdl);
    const td = h('td', { class: 'matrix-cell', 'data-tone': tone });
    const select = () => show(td, row, col, wdl);
    td.append(h('button', { type: 'button', title: label, 'aria-label': label, onclick: select, onmouseenter: select, onfocus: select },
      matrixCellText(wdl)));
    td.style.setProperty('--strength', String(strength));
    return td;
  };

  return h('div', { class: 'matrix-block' }, h('div', { class: 'matrix-wrap' },
    h('table', { class: 'matrix' },
      h('caption', { class: 'visually-hidden' }, t.statsUi.matrixCaption),
      h('thead', {}, h('tr', {},
        h('td', { class: 'matrix-corner' }),
        players.map((name) => h('th', { scope: 'col' }, h('abbr', { title: name }, abbreviate(name)))))),
      h('tbody', {}, players.map((name, i) => h('tr', {},
        h('th', { scope: 'row' }, h('a', { class: 'link', href: statsHref(subjectPath(playerSubject(name)), query) }, name)),
        cells[i].map((wdl, j) => cell(i, j, wdl))))))), detail);
}

/** @returns {{ el: HTMLElement }} */
export const renderMatrix = (stat, value, ctx) =>
  ({ el: statTile(stat, value && matrixBody(value, ctx), { wide: true, hideTitle: ctx.hideTitle }) });
