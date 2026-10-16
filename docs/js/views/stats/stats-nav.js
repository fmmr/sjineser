import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { NIGHTS_PATH, PAIRS_PATH, PLAYERS_PATH, statsHref } from './links.js';

/**
 * The stats sub-navigation (spec §9): four tabs on top of every stats page, and the breadcrumb
 * on the detail pages leading back to their list page.
 * @typedef {'overview' | 'players' | 'pairs' | 'nights'} StatsTab
 */

/** The tabs in order; each tab's list page. @type {{ id: StatsTab, path: string }[]} */
export const STATS_TABS = [
  { id: 'overview', path: '/stats' },
  { id: 'players', path: PLAYERS_PATH },
  { id: 'pairs', path: PAIRS_PATH },
  { id: 'nights', path: NIGHTS_PATH },
];

/** Path prefixes of the detail pages under each list page. */
const DETAIL_SECTIONS = { players: ['/stats/player', '/stats/compare'], pairs: ['/stats/pair'], nights: ['/stats/night'] };

/**
 * The tab a stats route belongs to: a list page is its own tab, a detail page belongs to its list.
 * @param {string} path e.g. '/stats/compare/Anne/Per'
 * @returns {StatsTab | null} null outside the stats pages
 */
export function statsTab(path) {
  const listed = STATS_TABS.find((tab) => tab.path === path);
  if (listed) return listed.id;
  const inSection = (section) => path === section || path.startsWith(`${section}/`);
  const detail = Object.entries(DETAIL_SECTIONS).find(([, sections]) => sections.some(inSection));
  return detail ? /** @type {StatsTab} */ (detail[0]) : null;
}

/**
 * The tabs for the page at `path`; links keep the season filter.
 * @param {string} path
 * @param {Record<string, string>} query
 * @returns {{ id: StatsTab, label: string, href: string, current: boolean }[]}
 */
export function statsTabs(path, query) {
  const active = statsTab(path);
  return STATS_TABS.map(({ id, path: target }) =>
    ({ id, label: t.statsUi.tabs[id], href: statsHref(target, query), current: id === active }));
}

/**
 * Breadcrumb of a detail page: its list page (a link keeping the season), then the page itself.
 * @param {StatsTab} tab
 * @param {string} current e.g. 'Anne mot Per'; '' = list page only
 * @param {Record<string, string>} query
 * @returns {{ label: string, href?: string }[]}
 */
export function breadcrumbParts(tab, current, query) {
  const list = STATS_TABS.find((entry) => entry.id === tab);
  const parts = [{ label: t.statsUi.tabs[tab], href: statsHref(list.path, query) }];
  return current ? [...parts, { label: current }] : parts;
}

/**
 * The tabs as a segmented control of links; the current one has aria-current="page".
 * @param {string} path this page
 * @param {Record<string, string>} query
 */
export const statsNav = (path, query) =>
  h('nav', { class: 'segmented stats-tabs', 'aria-label': t.statsUi.navLabel },
    statsTabs(path, query).map(({ label, href, current }) =>
      h('a', { class: 'segment', href, 'aria-current': current && 'page' },
        h('span', { class: 'segment-pill' }, label))));

/**
 * "Spillere › Anne": the list page links back, the last part is this page.
 * @param {{ label: string, href?: string }[]} parts from breadcrumbParts
 */
export const breadcrumb = (parts) =>
  h('nav', { class: 'stats-breadcrumb', 'aria-label': t.statsUi.breadcrumbLabel },
    h('ol', {}, parts.map(({ label, href }) =>
      h('li', {}, href
        ? h('a', { class: 'link', href }, label)
        : h('span', { 'aria-current': 'page' }, label)))));
