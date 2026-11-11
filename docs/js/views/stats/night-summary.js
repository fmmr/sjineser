import { formatDateLong, t } from '../../i18n/nb.js';
import { SITE_URL } from '../../config.js';
import { parseMatchId } from '../../domain/match.js';
import { nightSubject, overallSubject } from '../../domain/stats/subjects.js';
import { nightPlayers } from '../../domain/stats/catalog/nightsList.js';
import { nightWinner } from '../../domain/stats/catalog/nightWinner.js';
import { nightLeaderboard } from '../../domain/stats/catalog/nightLeaderboard.js';
import { nightSets } from '../../domain/stats/catalog/nightSets.js';
import { longestMatch } from '../../domain/stats/catalog/longestMatch.js';
import { longestWinStreak } from '../../domain/stats/catalog/longestWinStreak.js';
import { cleanSweeps } from '../../domain/stats/catalog/cleanSweeps.js';
import { subjectPath } from './links.js';
import { setStatus } from './widgets/sets.js';
import { formatValue } from './widgets/format.js';

/** "Hans og Frode 3–0 Tor og Per". @param {{ A: string[], B: string[], score: { A: number, B: number } }} set */
const scoreText = ({ A, B, score }) => t.nightEmail.score(t.names(A), score.A, score.B, t.names(B));

/** "Sett 2: Hans og Tor 0–1 Frode og Per, 1 uavgjort (pågår)". */
function setLine(set, isLast, ongoing) {
  const status = setStatus(set, isLast, ongoing);
  return [
    t.nightEmail.set(set.number, scoreText(set)),
    set.score.D > 0 ? `, ${t.statsUi.draws(set.score.D)}` : '',
    status ? ` (${t.statsUi.setStatus[status]})` : '',
  ].join('');
}

/** The night's records worth mailing, each as one line; absent records are left out. */
function recordLines(facts) {
  const subject = overallSubject();
  const longest = longestMatch.compute(facts, subject);
  const streak = longestWinStreak.compute(facts, subject);
  const sweeps = cleanSweeps.compute(facts, subject);
  return [
    longest && t.nightEmail.record(t.stats.longestMatch.title, t.nightEmail.games(longest.value),
      t.nightEmail.set(parseMatchId(longest.matchId).number, scoreText(longest.match))),
    streak && t.nightEmail.record(t.stats.longestWinStreak.title, t.nightEmail.games(streak.value), t.names(streak.holders)),
    sweeps && t.nightEmail.record(t.stats.cleanSweeps.title, formatValue(sweeps.value, 'int'), t.nightEmail.ranking(sweeps.ranking)),
  ].filter(Boolean);
}

/** A heading and its lines as a block; nothing without lines. */
const block = (heading, lines) => (lines.length > 0 ? [heading, ...lines].join('\n') : null);

/**
 * The night summary email as plain text (readable in any mail client): the night and who was
 * there, the night's winner, the night leaderboard, every set, a few records and the link to
 * the night page. Pure: built from facts computed with the night filter (spec §9).
 * @param {import('../../domain/stats/facts.js').Facts} facts facts for nightFilter(date)
 * @param {string} date YYYY-MM-DD
 * @param {{ ongoing?: boolean }} [options] ongoing: the night is still going on (marks the last unfinished set)
 * @returns {{ subject: string, text: string }}
 */
export function nightSummary(facts, date, { ongoing = false } = {}) {
  const subject = overallSubject();
  const longDate = formatDateLong(date);
  const night = facts.nights.find((n) => n.date === date);
  const winner = nightWinner.compute(facts, subject);
  const board = nightLeaderboard.compute(facts, subject);
  const sets = nightSets.compute(facts, subject)?.sets ?? [];

  const intro = [t.nightEmail.heading(longDate), night && t.nightEmail.players(t.names(nightPlayers(night)))]
    .filter(Boolean).join('\n');
  const rows = (board?.rows ?? []).map(({ rank, player, change, games }) => (games > 0
    ? t.nightEmail.leaderboardRow(rank, player, formatValue(change, 'signed'), games)
    : t.nightEmail.satOut(rank, player)));

  const blocks = [
    intro,
    winner && t.nightEmail.winner(winner.holders[0], formatValue(winner.value, 'signed')),
    sets.length === 0 && t.nightEmail.noGames,
    block(t.nightEmail.leaderboardHeading, sets.length > 0 ? rows : []),
    block(t.nightEmail.setsHeading, sets.map((set, i) => setLine(set, i === sets.length - 1, ongoing))),
    block(t.nightEmail.recordsHeading, recordLines(facts)),
    t.nightEmail.link(`${SITE_URL}#${subjectPath(nightSubject(date))}`),
  ];
  return { subject: t.nightEmail.subject(longDate), text: blocks.filter(Boolean).join('\n\n') };
}
