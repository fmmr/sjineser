import { h } from '../components/dom.js';
import { formatDate, t } from '../../i18n/nb.js';
import { currentNight } from '../../domain/match.js';
import { toISODate } from '../../domain/dates.js';

export function mountHome(root, { store, navigate }) {
  const nightCard = (night) =>
    h('div', { class: 'card stack' },
      h('p', { class: 'muted' }, t.nightOf(formatDate(night.date))),
      h('p', {}, night.players.join(', ')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => navigate('/play/match') }, t.continueNight));

  function update() {
    const night = currentNight(store.get());
    const startedToday = night?.date === toISODate(new Date());
    root.replaceChildren(
      h('section', { class: 'stack' },
        night ? nightCard(night) : h('p', { class: 'muted' }, store.isLoaded() || store.hasTried() ? t.noNights : t.loading),
        h('button', { class: 'btn', type: 'button', disabled: startedToday, onclick: () => navigate('/play/night') }, t.newNight)),
    );
  }

  update();
  return { update };
}
