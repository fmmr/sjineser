import { h } from '../components/dom.js';
import { dotsIcon } from '../components/icons.js';
import { listGroup, rowText } from '../components/list.js';
import { confirmSheet, openSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { formatDateLong, t } from '../../i18n/nb.js';
import { byName, playerOverview, validateRename } from '../../domain/players.js';

/** Subtitle of a player row: "12 spill · sist 14. okt. 2026" or "Ikke spilt ennå". */
const playedText = ({ games, lastPlayed }) =>
  (games > 0 ? t.players.played(games, formatDateLong(lastPlayed)) : t.players.notPlayed);

/**
 * Asks for a new name; the field says at once what is wrong with it.
 * @returns {Promise<string | null>} what was typed, or null when cancelled
 */
function renameSheet(name, players, initial = name) {
  const hint = h('p', { class: 'field-hint', id: 'rename-hint', 'aria-live': 'polite' });
  const input = h('input', {
    class: 'field',
    type: 'text',
    value: initial,
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'done',
    'aria-label': t.players.nameLabel,
    'aria-describedby': 'rename-hint',
    oninput: check,
  });

  function check() {
    const error = validateRename(name, input.value, players);
    hint.textContent = error ? t.errors[error] : '';
    input.setAttribute('aria-invalid', String(Boolean(error)));
  }

  check();
  return openSheet({
    title: t.players.renameTitle(name),
    message: t.players.renameNote,
    body: [input, hint],
    actions: [
      { label: t.players.save, value: () => input.value, variant: 'primary', submit: true },
      { label: t.sheet.cancel, value: null, variant: 'ghost' },
    ],
    cancelValue: null,
    initialFocus: () => {
      input.select();
      return input;
    },
  });
}

/** #/more/players: add, rename, (de)activate and delete players (spec §6). */
export function mountPlayers(root, { store, actions }) {
  const list = h('div', { class: 'more' });
  const input = h('input', {
    class: 'field', type: 'text', placeholder: t.newPlayerPlaceholder, autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': t.newPlayerPlaceholder,
  });

  function addPlayer(event) {
    event.preventDefault();
    const result = actions.addPlayer(input.value);
    if (!result.ok) return showToast(t.errors[result.error]);
    input.value = '';
  }

  async function rename(name, initial) {
    const typed = await renameSheet(name, store.get().players, initial);
    if (typed === null || typed.trim() === name) return;
    const result = actions.renamePlayer(name, typed);
    if (!result.ok) {
      showToast(t.errors[result.error]);
      if (result.error !== 'unknownPlayer') rename(name, typed);
      return;
    }
    showToast(t.players.renamed(typed.trim()));
  }

  async function remove(name) {
    const sure = await confirmSheet({
      title: t.players.deleteTitle(name),
      message: t.players.deleteMessage,
      confirmLabel: t.players.delete,
      destructive: true,
    });
    if (!sure) return;
    const result = actions.deletePlayer(name);
    showToast(result.ok ? t.players.deleted(name) : t.errors[result.error]);
  }

  async function openActions({ name, deletable }) {
    const choice = await openSheet({
      title: name,
      message: deletable ? null : t.errors.inUse,
      actions: [
        { label: t.players.rename, value: 'rename', variant: 'primary' },
        { label: t.players.delete, value: 'delete', variant: 'danger', disabled: !deletable },
        { label: t.sheet.cancel, value: null, variant: 'ghost' },
      ],
      cancelValue: null,
    });
    if (choice === 'rename') rename(name);
    if (choice === 'delete') remove(name);
  }

  function setActive(name, active) {
    const result = actions.setPlayerActive(name, active);
    if (!result.ok) showToast(t.errors[result.error]);
  }

  function playerRow(player, i) {
    const ids = { label: `player-${i}-name`, sub: `player-${i}-sub` };
    return h('div', { class: 'list-row list-row-control player-row' },
      rowText(player.name, playedText(player), ids),
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(player.active),
        'aria-label': t.players.activeLabel(player.name),
        'data-focus': `active:${player.name}`,
        onclick: () => setActive(player.name, !player.active),
      }, h('span', { class: 'switch-thumb', 'aria-hidden': 'true' })),
      h('button', {
        class: 'icon-button',
        type: 'button',
        'aria-label': t.players.actionsLabel(player.name),
        'aria-haspopup': 'dialog',
        'data-focus': `actions:${player.name}`,
        onclick: () => openActions(player),
      }, dotsIcon()));
  }

  function update() {
    const focused = document.activeElement?.dataset?.focus;
    const players = playerOverview(store.get()).sort((a, b) => byName(a.name, b.name));
    const active = players.filter((p) => p.active);
    const inactive = players.filter((p) => !p.active);
    let index = 0;
    const rows = (group) => group.map((p) => playerRow(p, (index += 1)));
    list.replaceChildren(...[
      players.length === 0 && h('p', { class: 'muted' }, t.players.none),
      active.length > 0 && listGroup('players-active', t.players.activeHeading, rows(active)),
      inactive.length > 0 && listGroup('players-inactive', t.players.inactiveHeading, rows(inactive),
        h('p', { class: 'list-note' }, t.players.inactiveNote)),
    ].filter(Boolean));
    // A toggled row moves to the other group; keep focus on its control.
    if (focused) [...list.querySelectorAll('[data-focus]')].find((el) => el.dataset.focus === focused)?.focus();
  }

  root.replaceChildren(
    h('section', { class: 'more' },
      h('h1', {}, t.players.title),
      h('form', { class: 'inline-form', onsubmit: addPlayer }, input, h('button', { class: 'btn', type: 'submit' }, t.addPlayer)),
      list),
  );
  update();
  return { update };
}
