import { h } from '../components/dom.js';
import { formatValue } from '../stats/widgets/format.js';
import { formatDateLong, t } from '../../i18n/nb.js';
import { REPO_URL, SHEET_URL } from '../../config.js';
import { CODE_STATS } from '../../about-data.js';
import { WINS_NEEDED } from '../../domain/match.js';
import { datasetSummary } from '../../domain/summary.js';
import { STATS } from '../../domain/stats/registry.js';
import { KINDS } from '../../domain/stats/kinds.js';
import { appVersion } from '../../pwa.js';

/** A labelled number (or short text) in the stats tile style. */
const tile = (label, value, valueClass = 'stat-value') =>
  h('article', { class: 'stat-tile' },
    h('h3', { class: 'stat-title' }, label),
    h('p', { class: valueClass }, value));

const count = (n) => formatValue(n, 'int');
const date = (iso) => (iso ? formatDateLong(iso) : t.about.none);

const section = (heading, ...children) =>
  h('section', { class: 'stats-section' }, h('h2', {}, heading), children);

const external = (href, text) => h('a', { class: 'link', href, target: '_blank', rel: 'noopener' }, text);

/** #/about: what the app is, links, live data counts, code statistics and the installed version. */
export function mountAbout(root, { store }) {
  const labels = t.about.dataLabels;
  const code = t.about.codeLabels;
  let version = null;
  let destroyed = false;

  function update() {
    const data = datasetSummary(store.get());
    root.replaceChildren(
      h('section', { class: 'stack about' },
        h('h1', {}, t.about.aboutTitle),
        t.about.aboutIntro({ winsNeeded: WINS_NEEDED }).map((text) => h('p', {}, text)),
        h('div', { class: 'stats-sections' },
          section(t.about.linksHeading,
            h('ul', { class: 'about-links' },
              h('li', {}, external(REPO_URL, t.about.repoLink)),
              h('li', {}, external(SHEET_URL, t.about.sheetLink), h('p', { class: 'muted' }, t.about.sheetNote)))),
          section(t.about.dataHeading,
            h('div', { class: 'stat-grid' },
              tile(labels.players, count(data.players)),
              tile(labels.nights, count(data.nights)),
              tile(labels.matches, count(data.matches)),
              tile(labels.games, count(data.games)),
              tile(labels.firstDate, date(data.firstDate), 'stat-value about-date'),
              tile(labels.latestDate, date(data.latestDate), 'stat-value about-date'))),
          section(t.about.codeHeading,
            h('div', { class: 'stat-grid' },
              tile(code.files, count(CODE_STATS.files)),
              tile(code.js, count(CODE_STATS.lines.js)),
              tile(code.css, count(CODE_STATS.lines.css)),
              tile(code.html, count(CODE_STATS.lines.html)),
              tile(code.appsScript, count(CODE_STATS.appsScriptLines)),
              tile(code.testFiles, count(CODE_STATS.testFiles)),
              tile(code.testCases, count(CODE_STATS.testCases)),
              tile(code.stats, count(STATS.length)),
              tile(code.kinds, count(KINDS.length)))),
          section(t.about.versionHeading,
            h('div', { class: 'stat-grid' },
              tile(t.about.versionLabel, version ?? t.about.none, 'stat-value about-version'))))),
    );
  }

  update();
  appVersion().then((found) => {
    version = found;
    if (!destroyed && found) update();
  });
  return {
    update,
    destroy() {
      destroyed = true;
    },
  };
}
