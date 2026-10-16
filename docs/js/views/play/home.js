import { h } from '../components/dom.js';
import { nightCardSkeleton } from '../components/skeleton.js';
import { formatDate, t } from '../../i18n/nb.js';
import { activeNight, currentNight } from '../../domain/match.js';

/**
 * Three states: a night is ongoing (continue it; no new night), the latest night is over
 * (a quiet card for it; start a new night), or there are no nights yet.
 */
export function mountHome(root, { store, navigate, clock }) {
  const ongoingCard = (night) =>
    h('div', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, t.nightOf(formatDate(night.date))),
      h('p', { class: 'night-players' }, night.players.join(', ')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => navigate('/play/match') }, t.continueNight));

  const endedCard = (night) =>
    h('div', { class: 'card stack night-ended' },
      h('p', { class: 'eyebrow' }, t.previousNight(formatDate(night.date))),
      h('p', { class: 'night-players' }, night.players.join(', ')));

  function update() {
    const ds = store.get();
    const latest = currentNight(ds);
    const ongoing = activeNight(ds, clock.today(), clock.hour());
    const newNight = () => navigate('/play/night');
    root.replaceChildren(
      h('section', { class: 'stack' },
        ongoing && ongoingCard(ongoing),
        latest && !ongoing && endedCard(latest),
        !latest && (store.isLoaded() || store.hasTried() ? h('p', { class: 'muted' }, t.noNights) : nightCardSkeleton()),
        h('button', { class: latest && !ongoing ? 'btn btn-primary' : 'btn', type: 'button', disabled: Boolean(ongoing), onclick: newNight }, t.newNight),
        ongoing && h('p', { class: 'muted center' }, t.nightOngoing)),
    );
  }

  update();
  return { update };
}
