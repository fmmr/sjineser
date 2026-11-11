import { h } from '../components/dom.js';
import { openSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { formatDate, formatDateLong, formatTime, t } from '../../i18n/nb.js';
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
    const { summarySent } = data.dataset.nights.find((n) => n.date === date) ?? {};
    page.append(summaryButton(ctx, date, summarySent, () => nightSummary(data.facts, seasonFacts(), date, { ongoing })));
    return rendered;
  }, { filter: nightFilter(isISODate(date) ? date : '') });

  if (isOngoing()) store.refresh();
  return { update: view.update, destroy: () => { clearInterval(poll); view.destroy(); } };
}

/**
 * "Oppsummering sendt 10. nov. kl. 21:03" (local time) for a night's summarySent; a value that
 * is not a timestamp (typed by hand) is shown as it is; null when not sent.
 * @param {string | undefined} summarySent
 * @returns {string | null}
 */
export function summarySentText(summarySent) {
  if (!summarySent) return null;
  const at = new Date(summarySent);
  if (Number.isNaN(at.getTime())) return t.nightEmail.sentAtUnknown(summarySent);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return t.nightEmail.sentAt(formatDate(day), formatTime(at));
}

/**
 * The confirm sheet's actions: Send, Send test til …, Avbryt. Once the night's summary has gone
 * out for real (summarySent), Send is disabled (the server would refuse it) and the test send
 * is focused instead.
 * @param {string | undefined} summarySent
 * @returns {{ actions: import('../components/sheet.js').SheetAction[], focusIndex: number }}
 */
export function summaryActions(summarySent) {
  const sent = Boolean(summarySent);
  return {
    actions: [
      { label: t.nightEmail.send, value: 'all', variant: 'primary', disabled: sent },
      { label: t.nightEmail.sendTest(SUMMARY_TEST_PLAYER), value: 'test', variant: 'ghost' },
      { label: t.sheet.cancel, value: null, variant: 'ghost' },
    ],
    focusIndex: sent ? 1 : 0,
  };
}

/**
 * "Send kveldens oppsummering på e-post": shows the email in a confirm sheet (the HTML in a
 * sandboxed iframe, so its inline styles stay out of the app), then sends it to everyone (or as
 * a test to SUMMARY_TEST_PLAYER) and says how it went. A real send happens once per night (the
 * server stamps summarySent); after that the page says when, and only the test send is offered.
 * @param {{ actions: object, sandbox?: boolean }} ctx
 * @param {string} date
 * @param {string | undefined} summarySent the night's Nights.summarySent
 * @param {() => { subject: string, text: string, html: string }} buildMail the summary as of the tap
 */
function summaryButton({ actions, sandbox = false }, date, summarySent, buildMail) {
  const button = h('button', { class: 'btn btn-ghost stats-night-email', type: 'button', onclick: send }, t.nightEmail.button);

  async function send() {
    const mail = buildMail();
    const choice = await openSheet({
      title: t.nightEmail.confirmTitle,
      message: t.nightEmail.confirmMessage,
      body: [
        sandbox && h('p', { class: 'sheet-message' }, t.nightEmail.sandboxNote),
        h('p', { class: 'email-subject' }, h('span', { class: 'muted' }, `${t.nightEmail.subjectLabel}: `), mail.subject),
        summarySent && h('p', { class: 'sheet-message muted' }, summarySentText(summarySent), '. ', t.nightEmail.resendHint),
        h('iframe', { class: 'email-preview', sandbox: '', srcdoc: mail.html, title: t.nightEmail.previewLabel }),
      ],
      ...summaryActions(summarySent),
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

  return h('div', { class: 'stats-night-email-row' },
    button,
    summarySent && h('p', { class: 'stats-night-email-sent muted' }, summarySentText(summarySent)));
}
