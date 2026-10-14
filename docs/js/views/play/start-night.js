import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { activePlayers, byName } from '../../domain/players.js';

const MIN_PLAYERS = 4;

export function mountStartNight(root, { store, actions, navigate }) {
  const selected = new Set();
  const chips = h('div', { class: 'chips' });
  const input = h('input', { class: 'field', type: 'text', placeholder: t.newPlayerPlaceholder, autocomplete: 'off', enterkeyhint: 'done' });
  const startButton = h('button', { class: 'btn btn-primary', type: 'button', onclick: start });

  function toggle(name) {
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    update();
  }

  function addPlayer(event) {
    event.preventDefault();
    const result = actions.addPlayer(input.value);
    if (!result.ok) return showToast(t.errors[result.error]);
    selected.add(input.value.trim());
    input.value = '';
    update();
  }

  function start() {
    const result = actions.startNight([...selected].sort(byName));
    if (!result.ok) return showToast(t.errors[result.error]);
    navigate('/play/new-match');
  }

  function update() {
    chips.replaceChildren(...activePlayers(store.get().players).map((p) =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(selected.has(p.name)), onclick: () => toggle(p.name) }, p.name)));
    const enough = selected.size >= MIN_PLAYERS;
    startButton.disabled = !enough;
    startButton.textContent = enough ? t.startNight : t.minPlayers(selected.size, MIN_PLAYERS);
  }

  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.choosePlayers),
      chips,
      h('form', { class: 'inline-form', onsubmit: addPlayer }, input, h('button', { class: 'btn', type: 'submit' }, t.addPlayer)),
      startButton),
  );
  update();
  return { update };
}
