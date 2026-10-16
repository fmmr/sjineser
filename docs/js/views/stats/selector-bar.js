import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { buildHash } from '../../routing.js';
import { byName, playerOverview } from '../../domain/players.js';
import { compareSubject, playerSubject } from '../../domain/stats/subjects.js';
import { seasonChoices } from './season-filter.js';
import { statsHref, subjectPath } from './links.js';
import { breadcrumb, breadcrumbParts, statsNav } from './stats-nav.js';

/**
 * The selector bar on top of the player and compare pages (spec §9): Spiller · Sammenlign · Sesong.
 * @typedef {{ value: string, label: string }} Option
 * @typedef {{ options: Option[], selected: string, disabled?: boolean }} Select
 * @typedef {{ player?: string, other?: string }} Selection '' or missing = none
 */

/** Path of the player page before a player is chosen. */
export const PLAYER_PATH = '/stats/player';

const nameOptions = (names) => names.map((name) => ({ value: name, label: name }));

/**
 * Options and selection of the three selects. Players: everyone who has played a game (ever),
 * Norwegian order, plus the current player; each list leaves out the player chosen in the other.
 * @param {import('../../domain/match.js').Dataset} dataset
 * @param {{ player?: string, other?: string, filter: import('../../domain/stats/filter.js').Filter, today: string }} state
 * @returns {{ player: Select, other: Select, season: Select }}
 */
export function selectorOptions(dataset, { player = '', other = '', filter, today }) {
  const played = new Set(playerOverview(dataset).filter((p) => p.games > 0).map((p) => p.name));
  if (player) played.add(player);
  if (other) played.add(other);
  const names = [...played].sort(byName);
  const except = (name) => names.filter((n) => n !== name);
  return {
    player: {
      options: [{ value: '', label: t.statsUi.choosePlayer }, ...nameOptions(except(other))],
      selected: player,
    },
    other: {
      options: [{ value: '', label: t.statsUi.noCompare }, ...(player ? nameOptions(except(player)) : [])],
      selected: player ? other : '',
      disabled: !player,
    },
    season: seasonChoices(dataset, filter, today),
  };
}

/**
 * Where a selection leads: compare page, player page, or the empty player page. Keeps only the
 * season filter; a hash, so '?sandbox' stays.
 * @param {Selection} selection
 * @param {Record<string, string>} query
 * @returns {string}
 */
export function selectorTarget({ player = '', other = '' }, query) {
  if (!player) return statsHref(PLAYER_PATH, query);
  const subject = other && other !== player ? compareSubject(player, other) : playerSubject(player);
  return statsHref(subjectPath(subject), query);
}

/** One labelled select. */
const field = (label, { options, selected, disabled = false }, onchange) =>
  h('label', { class: 'selector-field' },
    h('span', { class: 'selector-label' }, label),
    h('select', { class: 'field stats-filter selector-select', disabled, onchange },
      options.map(({ value, label: text }) => h('option', { value, selected: value === selected }, text))));

/**
 * The bar; every change navigates at once.
 * @param {{ dataset: object, filter: object, today: string }} data
 * @param {Selection & { path: string }} state path: this page, for the season select
 * @param {{ query: Record<string, string>, navigate: (path: string) => void }} ctx
 */
export function selectorBar({ dataset, filter, today }, { player = '', other = '', path }, { query, navigate }) {
  const selects = selectorOptions(dataset, { player, other, filter, today });
  return h('div', { class: 'selector-bar' },
    field(t.statsUi.playerLabel, selects.player, (event) => navigate(selectorTarget({ player: event.target.value, other }, query))),
    field(t.statsUi.compareLabel, selects.other, (event) => navigate(selectorTarget({ player, other: event.target.value }, query))),
    field(t.statsUi.seasonLabel, selects.season, (event) => navigate(buildHash(path, { ...query, s: event.target.value }))));
}

/**
 * Header of the player and compare pages: the stats tabs, the breadcrumb ("Spillere › Anne" once a
 * player is chosen), the page title for screen readers (the bar shows it) and the bar.
 * @param {string} title e.g. 'Anne' or 'Anne mot Per'
 * @param {{ dataset: object, filter: object, today: string }} data
 * @param {Selection & { path: string }} state
 * @param {{ query: Record<string, string>, navigate: (path: string) => void }} ctx
 */
export const selectorHeader = (title, data, state, ctx) =>
  h('header', { class: 'stats-header' },
    h('div', { class: 'stats-nav-row' }, statsNav(state.path, ctx.query)),
    breadcrumb(breadcrumbParts('players', state.player ? title : '', ctx.query)),
    h('h1', { class: 'visually-hidden' }, title),
    selectorBar(data, state, ctx));
