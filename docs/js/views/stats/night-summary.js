import { formatDateLong, t } from '../../i18n/nb.js';
import { SITE_URL } from '../../config.js';
import { parseMatchId } from '../../domain/match.js';
import { formatFilter, seasonFilterOf } from '../../domain/stats/filter.js';
import { nightSubject, overallSubject } from '../../domain/stats/subjects.js';
import { nightPlayers } from '../../domain/stats/catalog/nightsList.js';
import { nightWinner } from '../../domain/stats/catalog/nightWinner.js';
import { nightLeaderboard } from '../../domain/stats/catalog/nightLeaderboard.js';
import { nightSets } from '../../domain/stats/catalog/nightSets.js';
import { decisiveTable } from '../../domain/stats/catalog/decisiveTable.js';
import { pairsTable } from '../../domain/stats/catalog/pairsTable.js';
import { longestMatch } from '../../domain/stats/catalog/longestMatch.js';
import { mostDrawsInSet } from '../../domain/stats/catalog/mostDrawsInSet.js';
import { longestWinStreak } from '../../domain/stats/catalog/longestWinStreak.js';
import { longestDrawStreak } from '../../domain/stats/catalog/longestDrawStreak.js';
import { cleanSweeps } from '../../domain/stats/catalog/cleanSweeps.js';
import { comebacks } from '../../domain/stats/catalog/comebacks.js';
import { biggestUpset } from '../../domain/stats/catalog/biggestUpset.js';
import { leagueTable } from '../../domain/stats/catalog/leagueTable.js';
import { leaderboard } from '../../domain/stats/catalog/leaderboard.js';
import { renderNightEmail } from '../email/night-email.js';
import { subjectPath } from './links.js';
import { setStatus } from './widgets/sets.js';
import { formatValue } from './widgets/format.js';

/** A win streak this long is worth the headline. */
const HEADLINE_STREAK = 3;

/**
 * Everything the night email shows, computed once and rendered twice (text here, HTML in
 * views/email/night-email.js). Numbers stay numbers; record values and the talking point are
 * already texts (the same in both).
 * @typedef {{ number: number, A: string[], B: string[], score: { A: number, B: number, D: number },
 *   winner: 'A' | 'B' | null, status: 'ongoing' | 'unfinished' | null }} EmailSet
 * @typedef {{ title: string, value: string, about: string | null }} EmailRecord
 * @typedef {{ date: string, longDate: string, subject: string, players: string[],
 *   winner: { name: string, gain: number } | null, highlight: string | null, sets: EmailSet[],
 *   leaderboard: object[], decisive: object[] | null, pairs: object[] | null, records: EmailRecord[],
 *   season: { label: string, league: object[] | null, elo: object[] | null },
 *   links: { night: string, stats: string } }} NightEmailData
 */

/** "Hans og Frode 3–0 Tor og Per". @param {{ A: string[], B: string[], score: { A: number, B: number } }} set */
export const scoreText = ({ A, B, score }) => t.nightEmail.score(t.names(A), score.A, score.B, t.names(B));

/** "Sett 1: Hans og Frode 3–0 Tor og Per" for a record's match. */
const recordSet = (record) => t.nightEmail.set(parseMatchId(record.matchId).number, scoreText(record.match));

/** The night's records (spec §9), absent ones left out. @returns {EmailRecord[]} */
function recordsOf(facts) {
  const subject = overallSubject();
  const at = (stat) => stat.compute(facts, subject);
  const entry = (stat, value, about = null) => ({ title: t.stats[stat.id].title, value, about });
  const longest = at(longestMatch);
  const draws = at(mostDrawsInSet);
  const streak = at(longestWinStreak);
  const drawStreak = at(longestDrawStreak);
  const sweeps = at(cleanSweeps);
  const turned = at(comebacks);
  const upset = at(biggestUpset);
  return [
    longest && entry(longestMatch, t.nightEmail.games(longest.value), recordSet(longest)),
    draws && entry(mostDrawsInSet, t.statsUi.draws(draws.value), recordSet(draws)),
    streak && entry(longestWinStreak, t.nightEmail.games(streak.value), t.names(streak.holders)),
    drawStreak && entry(longestDrawStreak, t.nightEmail.games(drawStreak.value)),
    sweeps && entry(cleanSweeps, formatValue(sweeps.value, 'int'), t.nightEmail.ranking(sweeps.ranking)),
    turned && entry(comebacks, formatValue(turned.value, 'int'), t.nightEmail.ranking(turned.ranking)),
    upset && entry(biggestUpset, t.nightEmail.ratingGap(formatValue(upset.value, 'rating')), recordSet(upset)),
  ].filter(Boolean);
}

/**
 * The night's talking point: a win streak of HEADLINE_STREAK or more, else a comeback, else the
 * longest set. (A clean 3–0 sweep is always a streak of 3, so it needs no rule of its own.)
 * Null without games.
 */
function highlightOf(facts) {
  const subject = overallSubject();
  const streak = longestWinStreak.compute(facts, subject);
  if (streak && streak.value >= HEADLINE_STREAK) return t.nightEmail.highlight.winStreak(t.names(streak.holders), streak.value);
  const turned = comebacks.compute(facts, subject);
  if (turned) return t.nightEmail.highlight.comeback(t.names(turned.ranking.map((r) => r.name)));
  const longest = longestMatch.compute(facts, subject);
  return longest && t.nightEmail.highlight.longestSet(parseMatchId(longest.matchId).number, longest.value);
}

/**
 * The night email's content (spec §9), computed once: the night and who was there, the winner
 * and a talking point, every set, the night leaderboard, deciding games, the night's pairs, the
 * night's records, the season so far (league table; current ratings with the change this season)
 * and the links. Pure.
 * @param {import('../../domain/stats/facts.js').Facts} facts facts for nightFilter(date)
 * @param {import('../../domain/stats/facts.js').Facts} seasonFacts facts for seasonFilterOf(date)
 * @param {string} date YYYY-MM-DD
 * @param {{ ongoing?: boolean }} [options] ongoing: the night is still going on (marks the last unfinished set)
 * @returns {NightEmailData}
 */
export function nightSummaryData(facts, seasonFacts, date, { ongoing = false } = {}) {
  const subject = overallSubject();
  const longDate = formatDateLong(date);
  const night = facts.nights.find((n) => n.date === date);
  const winner = nightWinner.compute(facts, subject);
  const rawSets = nightSets.compute(facts, subject)?.sets ?? [];
  const sets = rawSets.map(({ number, A, B, score, winner: side, complete }, i) => ({
    number, A, B, score, winner: complete ? side : null,
    status: setStatus({ complete }, i === rawSets.length - 1, ongoing),
  }));
  const played = sets.length > 0;
  const season = seasonFilterOf(date);
  const elo = leaderboard.compute(seasonFacts, subject)?.rows
    .filter((row) => row.change !== null)
    .map((row, i) => ({ ...row, rank: i + 1 })) ?? [];
  return {
    date,
    longDate,
    subject: t.nightEmail.subject(longDate),
    players: night ? nightPlayers(night) : [],
    winner: winner && { name: winner.holders[0], gain: winner.value },
    highlight: played ? highlightOf(facts) : null,
    sets,
    leaderboard: played ? nightLeaderboard.compute(facts, subject)?.rows ?? [] : [],
    decisive: decisiveTable.compute(facts, subject)?.rows ?? null,
    pairs: pairsTable.compute(facts, subject)?.rows ?? null,
    records: recordsOf(facts),
    season: {
      label: t.statsUi.season(season),
      league: leagueTable.compute(seasonFacts, subject)?.rows ?? null,
      elo: elo.length > 0 ? elo : null,
    },
    links: {
      night: `${SITE_URL}#${subjectPath(nightSubject(date))}`,
      stats: `${SITE_URL}#/stats?s=${formatFilter(season)}`,
    },
  };
}

/** "SSUTS" for a form strip (oldest first). @param {('W' | 'D' | 'L')[]} form */
export const formLetters = (form) => form.map((outcome) => t.statsColumns[outcome]).join('');

/** A heading and its lines as a block; nothing without lines. */
const block = (heading, lines) => (lines && lines.length > 0 ? [heading, ...lines].join('\n') : null);

/** "Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (pågår)". @param {EmailSet} set */
const setLine = (set) => [
  t.nightEmail.set(set.number, scoreText(set)),
  set.score.D > 0 ? `, ${t.statsUi.draws(set.score.D)}` : '',
  set.status ? ` (${t.statsUi.setStatus[set.status]})` : '',
].join('');

const wdlText = ({ W, D, L }) => t.nightEmail.wdl(W, D, L);

/**
 * The night email as plain text (the fallback for mail clients without HTML), same content and
 * order as the HTML.
 * @param {NightEmailData} data
 * @returns {string}
 */
export function nightSummaryText(data) {
  const e = t.nightEmail;
  const rating = (row) => t.ratingLabel(formatValue(row.rating, 'rating'), row.provisional);
  const header = [e.heading(data.longDate), data.players.length > 0 && e.players(t.names(data.players))].filter(Boolean).join('\n');
  const headline = [data.winner && e.winner(data.winner.name, formatValue(data.winner.gain, 'signed')), data.highlight]
    .filter(Boolean).join('\n');
  const blocks = [
    header,
    headline,
    data.sets.length === 0 && e.noGames,
    block(e.setsHeading, data.sets.map(setLine)),
    block(e.leaderboardHeading, data.leaderboard.map((row) => (row.games > 0
      ? e.leaderboardRow(row.rank, row.player, formatValue(row.change, 'signed'), row.games, rating(row), formLetters(row.form))
      : e.satOut(row.rank, row.player)))),
    block(t.statsSections.decisive, data.decisive?.map((row) =>
      e.decisiveRow(row.player, row.games, wdlText(row), formatValue(row.winRate, 'percent')))),
    block(t.statsSections.nightPairs, data.pairs?.map((row) =>
      e.pairRow(t.names(row.pair), row.games, wdlText(row), row.chemistry === null ? null : formatValue(row.chemistry, 'signedPercent')))),
    block(e.recordsHeading, data.records.map(({ title, value, about }) => (about ? e.record(title, value, about) : e.recordPlain(title, value)))),
    (data.season.league || data.season.elo) && e.seasonHeading(data.season.label),
    block(t.stats.leagueTable.title, data.season.league?.map((row) =>
      e.leagueRow(row.rank, row.player, row.points, row.nights, row.setsWon))),
    block(e.eloHeading, data.season.elo?.map((row) =>
      e.eloRow(row.rank, row.player, rating(row), formatValue(row.change, 'signed'), row.games))),
    [e.link(data.links.night), e.statsLink(data.links.stats)].join('\n'),
  ];
  return blocks.filter(Boolean).join('\n\n');
}

/**
 * The night summary email (spec §9): subject, HTML body and its plain-text fallback, built from
 * the same data. Pure.
 * @param {import('../../domain/stats/facts.js').Facts} facts facts for nightFilter(date)
 * @param {import('../../domain/stats/facts.js').Facts} seasonFacts facts for seasonFilterOf(date)
 * @param {string} date YYYY-MM-DD
 * @param {{ ongoing?: boolean }} [options]
 * @returns {{ subject: string, text: string, html: string }}
 */
export function nightSummary(facts, seasonFacts, date, options) {
  const data = nightSummaryData(facts, seasonFacts, date, options);
  return { subject: data.subject, text: nightSummaryText(data), html: renderNightEmail(data) };
}
