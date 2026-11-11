import { h } from '../components/dom.js';
import { openSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { formatDateLong, t } from '../../i18n/nb.js';
import { POLL_MS, SUMMARY_TEST_PLAYER } from '../../config.js';
import { isISODate } from '../../domain/dates.js';
import { activeNight } from '../../domain/match.js';
import { buildFacts } from '../../domain/stats/facts.js';
import { nightFilter, seasonFilterOf } from '../../domain/stats/filter.js';
import { nightSubject, overallSubject } from '../../domain/stats/subjects.js';
import { nightPlayers } from '../../domain/stats/catalog/nightsList.js';
import { PAGES } from './pages.js';
import { NIGHTS_PATH, subjectPath } from './links.js';
import { nightSummary } from './night-summary.js';
import { mountStatsView, notFound, renderPage, statsHeader } from './render-page.js';

/**
 * #/stats/night/:date — one night: its sets, the night's leaderboard and winner, its pairs,
 * summary and records, all computed with the night filter, and a button that emails the
 * night's summary. While the night is ongoing (the active night) the page polls for new results
 * like the match screen does.
 */
export function mountStatsNight(root, ctx) {
  const { store, clock } = ctx;
  const date = ctx.params.date ?? '';
  const isOngoing = () => activeNight(store.get(), clock.today(), clock.hour())?.date === date;
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && isOngoing()) store.refresh();
  }, POLL_MS);

  const view = mountStatsView(root, ctx, (page, data) => {
    const night = isISODate(date) && data.facts.nights.find((n) => n.date === date);
    if (!night) {
      page.append(...notFound(NIGHTS_PATH, ctx));
      return undefined;
    }
    const ongoing = isOngoing();
    page.append(statsHeader({
      title: [t.nightOf(formatDateLong(date)), ongoing && h('span', { class: 'stat-marker' }, t.statsUi.setStatus.ongoing)],
      path: subjectPath(nightSubject(date)),
      crumb: formatDateLong(date),
      season: false,
      extra: [h('p', { class: 'stats-night-players' }, t.names(nightPlayers(night)))],
    }, ctx, data));
    const rendered = renderPage(page, PAGES.night, data.facts, overallSubject(), { ...ctx, ongoing });
    // The season's facts only when the button is tapped (the email's "season so far").
    const seasonFacts = () => buildFacts(data.dataset, seasonFilterOf(date), { today: data.today, hour: clock.hour() });
    page.append(summaryButton(ctx, date, () => nightSummary(data.facts, seasonFacts(), date, { ongoing })));
    return rendered;
  }, { filter: nightFilter(isISODate(date) ? date : '') });

  if (isOngoing()) store.refresh();
  return { update: view.update, destroy: () => { clearInterval(poll); view.destroy(); } };
}

/**
 * "Send kveldens oppsummering på e-post": shows the email in a confirm sheet (the HTML in a
 * sandboxed iframe, so its inline styles stay out of the app), then sends it to everyone (or as
 * a test to SUMMARY_TEST_PLAYER) and says how it went. Can be sent again.
 * @param {{ actions: object, sandbox?: boolean }} ctx
 * @param {string} date
 * @param {() => { subject: string, text: string, html: string }} buildMail the summary as of the tap
 */
function summaryButton({ actions, sandbox = false }, date, buildMail) {
  const button = h('button', { class: 'btn btn-ghost stats-night-email', type: 'button', onclick: send }, t.nightEmail.button);

  async function send() {
    const mail = buildMail();
    const choice = await openSheet({
      title: t.nightEmail.confirmTitle,
      message: t.nightEmail.confirmMessage,
      body: [
        sandbox && h('p', { class: 'sheet-message' }, t.nightEmail.sandboxNote),
        h('p', { class: 'email-subject' }, h('span', { class: 'muted' }, `${t.nightEmail.subjectLabel}: `), mail.subject),
        h('iframe', { class: 'email-preview', sandbox: '', srcdoc: mail.html, title: t.nightEmail.previewLabel }),
      ],
      actions: [
        { label: t.nightEmail.send, value: 'all', variant: 'primary' },
        { label: t.nightEmail.sendTest(SUMMARY_TEST_PLAYER), value: 'test', variant: 'ghost' },
        { label: t.sheet.cancel, value: null, variant: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!choice) return;
    const test = choice === 'test';
    button.disabled = true;
    button.textContent = t.nightEmail.sending;
    const result = await actions.sendNightSummary(date, mail, test ? { testPlayer: SUMMARY_TEST_PLAYER } : {});
    button.disabled = false;
    button.textContent = t.nightEmail.button;
    if (!result.ok) showToast(t.errors[result.error]);
    else showToast(test ? t.nightEmail.sentTest(SUMMARY_TEST_PLAYER) : t.nightEmail.sent(result.recipients));
  }

  return h('div', { class: 'stats-night-email-row' }, button);
}
