import { h } from '../components/dom.js';
import { chevronIcon } from '../components/icons.js';
import { listGroup, rowText } from '../components/list.js';
import { confirmSheet, textSheet } from '../components/sheet.js';
import { downloadText } from '../components/download.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { leagueUrl } from '../../leagues.js';
import { backupCounts, backupFileName, parseBackup } from '../../domain/backup.js';

const trail = () => h('span', { class: 'list-trail' }, chevronIcon());

/** The toast for a failed backup action: the t.errors text, with the server's reason when it gave one. */
const errorText = (result) =>
  (result.detail && result.error === 'restoreInvalid' ? t.errors.restoreInvalidBecause(result.detail) : t.errors[result.error]);

/**
 * #/more/leagues: the leagues this phone knows (the open one marked), rename, add, and the
 * backup of the open league. Switching reloads the app on the other league's address; changes
 * not yet sent to the sheet stay on the phone, under their own league, and go out the next time
 * that league is open, so the user is told.
 * @param {HTMLElement} root
 * @param {{ league: object, leagues: object, unsynced: () => number, actions: object, clock: { today(): string }, sandbox: boolean }} ctx
 */
export function mountLeagues(root, { league, leagues, unsynced, actions, clock, sandbox }) {
  if (sandbox) {
    root.replaceChildren(h('section', { class: 'more' }, h('h1', {}, t.leagues.title), h('p', { class: 'muted' }, t.leagues.sandboxNote)));
    return {};
  }

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

  async function rename() {
    const input = await textSheet({
      title: t.leagues.renameTitle,
      message: t.leagues.renameMessage,
      label: t.leagues.renameLabel,
      value: league.name,
      confirmLabel: t.leagues.renameConfirm,
    });
    if (input === null || input.trim() === league.name) return;
    const result = await actions.renameLeague(input);
    if (!result.ok) return showToast(t.errors[result.error]);
    leagues.remember(league.id, result.name);
    showToast(t.leagues.renamed(result.name));
    // The row texts hold the old name: draw the page again.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  async function backup() {
    const result = await actions.exportBackup();
    if (!result.ok) return showToast(t.errors[result.error]);
    downloadText(backupFileName(league.name, clock.today()), `${JSON.stringify(result.backup, null, 2)}\n`);
    showToast(t.leagues.backupDone);
  }

  async function restoreFrom(file) {
    const backupFile = file && parseBackup(await file.text());
    if (!backupFile) return showToast(t.errors.badBackupFile);
    const sure = await confirmSheet({
      title: t.leagues.restoreTitle(league.name),
      message: t.leagues.restoreMessage(backupCounts(backupFile)),
      confirmLabel: t.leagues.restoreConfirm,
      destructive: true,
    });
    if (!sure) return;
    const result = await actions.restoreBackup(backupFile);
    showToast(result.ok ? t.leagues.restored(result.counts) : errorText(result));
  }

  const picker = h('input', {
    class: 'visually-hidden',
    type: 'file',
    accept: 'application/json,.json',
    tabindex: '-1',
    'aria-hidden': 'true',
    onchange: () => {
      const [file] = picker.files;
      picker.value = '';
      restoreFrom(file);
    },
  });

  const leagueRows = leagues.list().map((known) => {
    const open = known.id === league.id;
    return h('button', {
      class: 'list-row',
      type: 'button',
      'aria-current': open ? 'true' : null,
      'aria-label': open ? null : t.leagues.switchTo(known.name),
      onclick: open ? null : () => switchTo(known),
    }, rowText(known.name, open ? t.leagues.open : null), open ? null : trail());
  });

  root.replaceChildren(
    h('section', { class: 'more' },
      h('h1', {}, t.leagues.title),
      listGroup('leagues-list', t.leagues.heading, [
        ...leagueRows,
        h('button', { class: 'list-row', type: 'button', onclick: rename }, rowText(t.leagues.rename, league.name), trail()),
        h('button', { class: 'list-row', type: 'button', onclick: add }, rowText(t.leagues.add, t.leagues.addNote), trail()),
      ], h('p', { class: 'list-note muted' }, t.leagues.note)),
      listGroup('leagues-backup', t.leagues.backupHeading, [
        h('button', { class: 'list-row', type: 'button', onclick: backup }, rowText(t.leagues.backup, t.leagues.backupNote), trail()),
        h('button', { class: 'list-row', type: 'button', onclick: () => picker.click() }, rowText(t.leagues.restore, t.leagues.restoreNote), trail()),
      ], h('p', { class: 'list-note muted' }, t.leagues.backupNoteEmail)),
      picker),
  );
  return {};
}
