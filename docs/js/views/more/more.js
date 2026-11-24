import { h } from '../components/dom.js';
import { chevronIcon, externalIcon } from '../components/icons.js';
import { confirmSheet, textSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { linkRow, listGroup, rowText } from '../components/list.js';
import { t } from '../../i18n/nb.js';
import { REPO_URL, SHEET_URL } from '../../config.js';
import { THEME_CHOICES, chooseTheme, themeChoice } from '../../theme.js';
import { sandboxUrl } from '../../routing.js';
import { leagueUrl } from '../../leagues.js';
import { appVersion } from '../../pwa.js';

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

/**
 * The leagues this phone knows, the open one marked, and "Legg til liga". Switching reloads the
 * app on the other league's address; changes not yet sent to the sheet stay on the phone,
 * under their own league, and go out the next time that league is open, so the user is told.
 * @param {{ league: object, leagues: object, unsynced: () => number }} ctx
 */
function leaguesGroup({ league, leagues, unsynced }) {
  async function switchTo(target) {
    const pending = unsynced();
    if (pending > 0) {
      const go = await confirmSheet({
        title: t.leagues.unsyncedTitle,
        message: t.leagues.unsyncedMessage(pending, league.name),
        confirmLabel: t.leagues.unsyncedConfirm,
      });
      if (!go) return;
    }
    location.assign(leagueUrl(location, target.id));
  }

  async function add() {
    const input = await textSheet({
      title: t.leagues.addTitle,
      message: t.leagues.addMessage,
      label: t.leagues.addLabel,
      placeholder: t.leagues.addPlaceholder,
      confirmLabel: t.leagues.addConfirm,
    });
    if (input === null) return;
    const result = await leagues.join(input);
    if (!result.ok) return showToast(result.error === 'network' ? t.errors.network : t.leagues[result.error]);
    if (result.id === league.id) return;
    await switchTo({ id: result.id });
  }

  const rows = leagues.list().map((known) => {
    const open = known.id === league.id;
    return h('button', {
      class: 'list-row',
      type: 'button',
      'aria-current': open ? 'true' : null,
      'aria-label': open ? null : t.leagues.switchTo(known.name),
      onclick: open ? null : () => switchTo(known),
    },
    rowText(known.name, open ? t.leagues.open : null),
    open ? null : h('span', { class: 'list-trail' }, chevronIcon()));
  });
  rows.push(h('button', { class: 'list-row', type: 'button', onclick: add },
    rowText(t.leagues.add, t.leagues.addNote), h('span', { class: 'list-trail' }, chevronIcon())));
  return listGroup('more-leagues', t.leagues.heading, rows, h('p', { class: 'list-note muted' }, t.leagues.note));
}

/** #/more: players, settings, explanations and about, as grouped lists (spec §6). */
export function mountMore(root, ctx) {
  const { sandbox, league } = ctx;
  let destroyed = false;
  const version = h('span', { class: 'list-value' }, t.about.none);

  root.replaceChildren(
    h('section', { class: 'more' },
      h('h1', {}, t.more.title),
      listGroup('more-game', t.more.gameHeading, [linkRow('#/more/players', t.more.players, t.more.playersNote)]),
      !sandbox && leaguesGroup(ctx),
      listGroup('more-settings', t.more.settingsHeading, [themeRow(), sandboxRow(sandbox)]),
      listGroup('more-explain', t.more.explainHeading, [
        linkRow('#/about/teams', t.about.teamsLink),
        linkRow('#/about/rating', t.about.ratingLink),
      ]),
      listGroup('more-about', t.more.aboutHeading, [
        linkRow('#/about', t.about.aboutLink),
        externalRow(REPO_URL, t.more.repo),
        // SHEET_URL is the main league's sheet; the other leagues' sheets belong to their owners.
        league.isMain && externalRow(SHEET_URL, t.more.sheet, t.about.sheetNote),
        h('div', { class: 'list-row' }, rowText(t.more.version), version),
      ].filter(Boolean))),
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
