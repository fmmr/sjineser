import { h } from '../components/dom.js';
import { chevronIcon, externalIcon } from '../components/icons.js';
import { t } from '../../i18n/nb.js';
import { REPO_URL, SHEET_URL } from '../../config.js';
import { THEME_CHOICES, chooseTheme, themeChoice } from '../../theme.js';
import { sandboxUrl } from '../../routing.js';
import { appVersion } from '../../pwa.js';

/** A titled group of rows: small heading above a card with hairlines between the rows. */
const group = (id, heading, ...rows) =>
  h('section', { class: 'list-group', 'aria-labelledby': id },
    h('h2', { class: 'list-heading', id }, heading),
    h('ul', { class: 'list-card' }, rows.map((row) => h('li', {}, row))));

/** Label with an optional muted line below it; `hint` is extra text for screen readers only. */
const rowText = (label, sub, ids = {}, hint = null) =>
  h('span', { class: 'list-text' },
    h('span', { class: 'list-label', id: ids.label }, label, hint && h('span', { class: 'visually-hidden' }, hint)),
    sub && h('span', { class: 'list-sub', id: ids.sub }, sub));

/** A row that opens another screen of the app. */
const linkRow = (href, label) =>
  h('a', { class: 'list-row', href }, rowText(label), h('span', { class: 'list-trail' }, chevronIcon()));

/** A row that opens another site in a new tab. */
const externalRow = (href, label, sub) =>
  h('a', { class: 'list-row', href, target: '_blank', rel: 'noopener' },
    rowText(label, sub, {}, t.more.newTab),
    h('span', { class: 'list-trail' }, externalIcon()));

/** System · Mørk · Lys as one radio group; arrow keys move between them (native radios). */
function themeRow() {
  const current = themeChoice();
  return h('div', { class: 'list-row list-row-control' },
    rowText(t.more.theme, null, { label: 'more-theme-label' }),
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'more-theme-label' },
      THEME_CHOICES.map((choice) =>
        h('label', { class: 'segment' },
          h('input', {
            class: 'segment-input',
            type: 'radio',
            name: 'theme',
            value: choice,
            checked: choice === current,
            onchange: () => chooseTheme(choice),
          }),
          h('span', { class: 'segment-pill' }, t.more.themeChoices[choice])))));
}

/** Reloads the current screen in or out of test mode (spec §17). */
function sandboxRow(sandbox) {
  const toggle = h('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(sandbox),
    'aria-labelledby': 'more-sandbox-label',
    'aria-describedby': 'more-sandbox-note',
    onclick: () => {
      toggle.setAttribute('aria-checked', String(!sandbox));
      location.assign(sandboxUrl(location, !sandbox));
    },
  }, h('span', { class: 'switch-thumb', 'aria-hidden': 'true' }));
  return h('div', { class: 'list-row list-row-control' },
    rowText(t.more.sandbox, t.more.sandboxNote, { label: 'more-sandbox-label', sub: 'more-sandbox-note' }),
    toggle);
}

/** #/more: settings, explanations and about, as grouped lists (spec §6). */
export function mountMore(root, { sandbox }) {
  let destroyed = false;
  const version = h('span', { class: 'list-value' }, t.about.none);

  root.replaceChildren(
    h('section', { class: 'more' },
      h('h1', {}, t.more.title),
      group('more-settings', t.more.settingsHeading, themeRow(), sandboxRow(sandbox)),
      group('more-explain', t.more.explainHeading,
        linkRow('#/about/teams', t.about.teamsLink),
        linkRow('#/about/rating', t.about.ratingLink)),
      group('more-about', t.more.aboutHeading,
        linkRow('#/about', t.about.aboutLink),
        externalRow(REPO_URL, t.more.repo),
        externalRow(SHEET_URL, t.more.sheet, t.about.sheetNote),
        h('div', { class: 'list-row' }, rowText(t.more.version), version))),
  );

  appVersion().then((found) => {
    if (!destroyed && found) version.textContent = found;
  });
  return {
    destroy() {
      destroyed = true;
    },
  };
}
