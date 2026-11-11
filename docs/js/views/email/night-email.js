import { t } from '../../i18n/nb.js';
import { formatValue } from '../stats/widgets/format.js';
import { el, htmlDocument } from './email-html.js';

/**
 * The night summary email as HTML (spec §9), from the data computed in
 * views/stats/night-summary.js (the same data as the plain-text fallback).
 *
 * EXCEPTION to the no-inline-styles rule: mail clients (Gmail, Outlook) ignore stylesheets and
 * <style> blocks only partly, so every element here carries its own inline style. Inline styles
 * live ONLY in this module and its helper email-html.js; never anywhere else in the app.
 *
 * Design: light and restrained like the app (spec §11): system font, near-black text, hairline
 * borders, the team colours, one accent. Table-based layout at most 600 px wide, no external
 * images, stylesheets or fonts. Colours are the light theme values of css/tokens.css (a test
 * keeps them in step); hairlines are the token's alpha borders flattened onto white.
 */

/** Light theme colours from css/tokens.css (`:root[data-theme="light"]`). */
export const EMAIL_COLORS = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  surfaceRaised: '#eef0f3',
  text: '#111418',
  textMuted: '#5a636f',
  accent: '#186a58',
  teamA: '#2f5fa8',
  teamB: '#87570b',
  draw: '#5f6874',
  danger: '#b3423c',
  /** --border (rgb(16 22 32 / 0.09)) and --border-strong (0.16) on white. */
  border: '#e9eaeb',
  borderStrong: '#d9dadb',
};
const C = EMAIL_COLORS;

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const WIDTH = 600;
const PAD = '24px';

const NUM = { 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', 'white-space': 'nowrap' };
const MUTED = { color: C.textMuted };
const CELL = { padding: '7px 6px', 'border-top': `1px solid ${C.border}`, 'font-size': '14px', 'line-height': '20px', color: C.text };
const HEAD_CELL = { padding: '0 6px 6px', 'font-size': '12px', 'font-weight': 600, color: C.textMuted, 'text-align': 'left' };
const FORM_COLORS = { W: C.accent, D: C.draw, L: C.danger };

/** A layout table (role=presentation, no spacing). */
const table = (style, ...rows) => el('table', {
  role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', border: '0',
  style: { width: '100%', 'border-collapse': 'collapse', 'font-family': FONT, ...style },
}, ...rows);

/** A section heading: small, semibold, muted, like the app's section labels. */
const heading = (text, style = {}) => el('h2', {
  style: { margin: '0 0 10px', 'font-size': '13px', 'line-height': '18px', 'font-weight': 600, 'letter-spacing': '0.06em',
    'text-transform': 'uppercase', color: C.textMuted, 'font-family': FONT, ...style },
}, text);

/** One section of the card: padding and an optional top hairline. */
const section = (...content) => el('tr', {}, el('td', {
  style: { padding: `18px ${PAD}`, 'border-top': `1px solid ${C.border}`, 'font-family': FONT, color: C.text },
}, ...content));

/** Colour of a signed number: gains accent, losses danger, zero muted. */
const signColor = (value) => (value > 0 ? C.accent : value < 0 ? C.danger : C.textMuted);

/** A signed value (e.g. rating change, kjemi), coloured by its sign. */
const signed = (value, format = 'signed') => el('span', { style: { color: signColor(value), 'font-weight': 600 } }, formatValue(value, format));

const ratingText = (row) => t.ratingLabel(formatValue(row.rating, 'rating'), row.provisional);

/** The form strip as S/U/T chips, oldest first. @param {('W' | 'D' | 'L')[]} form */
const formChips = (form) => form.map((outcome) => el('span', {
  title: t.statsColumnTitles[outcome],
  style: {
    display: 'inline-block', width: '16px', height: '16px', 'line-height': '16px', margin: '0 2px 0 0',
    'border-radius': '4px', background: FORM_COLORS[outcome], color: '#ffffff', 'font-size': '10px',
    'font-weight': 700, 'text-align': 'center',
  },
}, t.statsColumns[outcome]));

/**
 * A data table: header labels and rows of cells; `numeric` marks right-aligned columns by index.
 * @param {string[]} labels
 * @param {unknown[][]} rows
 * @param {Set<number>} numeric
 */
function dataTable(labels, rows, numeric) {
  const align = (i) => (numeric.has(i) ? NUM : {});
  return table({},
    el('tr', {}, labels.map((label, i) => el('th', { style: { ...HEAD_CELL, ...align(i) } }, label))),
    rows.map((cells) => el('tr', {}, cells.map((cell, i) => (cell?.colspan
      ? el('td', { colspan: String(cell.colspan), style: { ...CELL, ...MUTED, ...align(i) } }, cell.content)
      : el('td', { style: { ...CELL, ...align(i) } }, cell))))));
}

/** The header: brand, the night, who was there; the winner and the talking point in a soft box. */
function header(data) {
  const e = t.nightEmail;
  const winnerBox = (data.winner || data.highlight) && table({ margin: '16px 0 0', background: C.surfaceRaised, 'border-radius': '12px' },
    el('tr', {}, el('td', { style: { padding: '14px 16px', 'font-family': FONT } },
      data.winner && el('div', { style: { 'font-size': '17px', 'line-height': '24px', 'font-weight': 600, color: C.text } },
        `${t.stats.nightWinner.title}: `, data.winner.name, ' ', el('span', { style: { color: C.accent } }, `(${formatValue(data.winner.gain, 'signed')})`)),
      data.highlight && el('div', { style: { 'font-size': '14px', 'line-height': '20px', color: C.textMuted, margin: data.winner ? '4px 0 0' : '0' } },
        data.highlight))));
  return el('tr', {}, el('td', { style: { padding: `${PAD} ${PAD} 20px`, 'font-family': FONT, color: C.text } },
    el('div', { style: { 'font-size': '12px', 'font-weight': 600, 'letter-spacing': '0.08em', 'text-transform': 'uppercase', color: C.textMuted } },
      t.appName),
    el('h1', { style: { margin: '4px 0 0', 'font-size': '26px', 'line-height': '32px', 'font-weight': 700, 'letter-spacing': '-0.02em', color: C.text } },
      e.heading(data.longDate)),
    data.players.length > 0 && el('p', { style: { margin: '6px 0 0', 'font-size': '14px', 'line-height': '20px', color: C.textMuted } },
      e.players(t.names(data.players))),
    winnerBox));
}

/** A team on a scoreboard: its colour, bold when it won the set. */
const team = (names, color, won, align) => el('td', {
  width: '42%',
  style: { padding: '2px 0', 'text-align': align, color, 'font-size': '15px', 'line-height': '21px', 'font-weight': won ? 700 : 400 },
}, t.names(names));

/** One set as a small scoreboard: "Sett 1 · 1 uavgjort · ikke ferdig", then A  3–0  B. */
function scoreboard(set) {
  const label = [
    t.statsUi.setTitle(set.number),
    set.score.D > 0 && t.statsUi.draws(set.score.D),
    set.status && t.statsUi.setStatus[set.status],
  ].filter(Boolean).join(' · ');
  return table({ margin: '0 0 8px', border: `1px solid ${C.border}`, 'border-collapse': 'separate', 'border-radius': '10px' },
    el('tr', {}, el('td', { colspan: '3', style: { padding: '8px 12px 0', 'font-size': '12px', 'line-height': '16px', color: C.textMuted } }, label)),
    el('tr', {}, el('td', { colspan: '3', style: { padding: '0 12px 8px' } }, table({},
      el('tr', {},
        team(set.A, C.teamA, set.winner === 'A', 'left'),
        el('td', { width: '16%', style: { 'text-align': 'center', 'font-size': '20px', 'line-height': '26px', 'font-weight': 700,
          'font-variant-numeric': 'tabular-nums', 'white-space': 'nowrap', color: C.text } }, `${set.score.A}–${set.score.B}`),
        team(set.B, C.teamB, set.winner === 'B', 'right'))))));
}

const columns = (...keys) => keys.map((key) => t.statsColumns[key]);
const playerCell = (name) => el('span', { style: { 'font-weight': 600 } }, name);

function nightLeaderboard(rows) {
  return dataTable(columns('rank', 'player', 'rating', 'change', 'games', 'form'), rows.map((row) => [
    row.rank, playerCell(row.player), ratingText(row),
    ...(row.games > 0
      ? [signed(row.change), row.games, el('span', { style: { 'white-space': 'nowrap' } }, formChips(row.form))]
      : [{ colspan: 3, content: t.nightEmail.satOutLabel }]),
  ]), new Set([0, 2, 3, 4]));
}

const wdlCells = (row) => [row.games, row.W, row.D, row.L, formatValue(row.winRate, 'percent')];

const decisive = (rows) => dataTable(columns('player', 'games', 'W', 'D', 'L', 'winRate'),
  rows.map((row) => [playerCell(row.player), ...wdlCells(row)]), new Set([1, 2, 3, 4, 5]));

const pairs = (rows) => dataTable(columns('pair', 'games', 'W', 'D', 'L', 'winRate', 'chemistry'),
  rows.map((row) => [playerCell(t.names(row.pair)), ...wdlCells(row), row.chemistry === null ? t.statsUi.none : signed(row.chemistry, 'signedPercent')]),
  new Set([1, 2, 3, 4, 5, 6]));

const records = (list) => table({}, list.map(({ title, value, about }, i) => el('tr', {},
  el('td', { width: '40%', style: { ...CELL, ...MUTED, 'vertical-align': 'top', ...(i === 0 ? { 'border-top': '0' } : {}) } }, title),
  el('td', { style: { ...CELL, ...(i === 0 ? { 'border-top': '0' } : {}) } },
    el('span', { style: { 'font-weight': 600 } }, value),
    about && el('span', { style: MUTED }, ` · ${about}`)))));

const league = (rows) => dataTable(columns('rank', 'player', 'nights', 'setsWon', 'points'),
  rows.map((row) => [row.rank, playerCell(row.player), row.nights, row.setsWon, el('strong', {}, row.points)]), new Set([0, 2, 3, 4]));

const elo = (rows) => dataTable(columns('rank', 'player', 'rating', 'change', 'games'),
  rows.map((row) => [row.rank, playerCell(row.player), ratingText(row), signed(row.change), row.games]), new Set([0, 2, 3, 4]));

/** A link as a pill button; primary is dark like the app's primary buttons. */
const button = (href, label, primary) => el('a', {
  href,
  style: {
    display: 'inline-block', margin: '0 8px 8px 0', padding: '10px 18px', 'border-radius': '999px', 'font-size': '14px',
    'line-height': '20px', 'font-weight': 600, 'text-decoration': 'none', 'font-family': FONT,
    ...(primary
      ? { background: C.text, color: C.surface, border: `1px solid ${C.text}` }
      : { background: C.surface, color: C.text, border: `1px solid ${C.borderStrong}` }),
  },
}, label);

/**
 * The night email as a complete HTML document.
 * @param {import('../stats/night-summary.js').NightEmailData} data
 * @returns {string}
 */
export function renderNightEmail(data) {
  const e = t.nightEmail;
  const { season } = data;
  const card = el('table', {
    role: 'presentation', width: String(WIDTH), cellpadding: '0', cellspacing: '0', border: '0', align: 'center',
    style: { width: '100%', 'max-width': `${WIDTH}px`, margin: '0 auto', background: C.surface, border: `1px solid ${C.border}`,
      'border-radius': '16px', 'border-collapse': 'separate', 'font-family': FONT, color: C.text },
  },
  header(data),
  data.sets.length === 0
    ? section(el('p', { style: { margin: 0, 'font-size': '15px', color: C.textMuted } }, e.noGames))
    : section(heading(e.setsHeading), data.sets.map(scoreboard)),
  data.leaderboard.length > 0 && section(heading(e.leaderboardHeading), nightLeaderboard(data.leaderboard)),
  data.decisive && section(heading(t.statsSections.decisive), decisive(data.decisive)),
  data.pairs && section(heading(t.statsSections.nightPairs), pairs(data.pairs)),
  data.records.length > 0 && section(heading(e.recordsHeading), records(data.records)),
  (season.league || season.elo) && section(
    el('h2', { style: { margin: '0 0 14px', 'font-size': '18px', 'line-height': '24px', 'font-weight': 700, color: C.text, 'font-family': FONT } },
      e.seasonHeading(season.label)),
    season.league && [heading(t.stats.leagueTable.title), league(season.league)],
    season.elo && [heading(e.eloHeading, { margin: season.league ? '22px 0 10px' : '0 0 10px' }), elo(season.elo)],
  ),
  section(button(data.links.night, e.nightLinkLabel, true), button(data.links.stats, e.statsLinkLabel, false)));

  const page = table({ background: C.bg },
    el('tr', {}, el('td', { align: 'center', bgcolor: C.bg, style: { padding: '24px 12px', background: C.bg } }, card)));
  return htmlDocument(data.subject, page, { background: C.bg, color: C.text, 'font-family': FONT });
}
