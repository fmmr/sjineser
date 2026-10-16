import assert from 'node:assert/strict';
import { buildFacts } from '../../../../docs/js/domain/stats/facts.js';
import { makeMatchId, playersOf, seatsOf as seatsOfTeams } from '../../../../docs/js/domain/match.js';
import { dataset } from '../../../helpers.js';
import { statById } from '../../../../docs/js/domain/stats/registry.js';
import { isValidValue } from '../../../../docs/js/domain/stats/kinds.js';

export const ALL = { kind: 'all' };

/** Seats 'Hans Frode - Tor Per' or 'Hans Frode Kari - Tor Per' → { A1, A2, A3, B1, B2, B3 }. */
function seatsOf(text) {
  const [A, B] = text.split('-').map((side) => side.trim().split(/\s+/));
  return seatsOfTeams(A, B);
}

/**
 * Builds a dataset from a compact description. Each night: { date, players?, matches }, each
 * match: [seats, results] with seats like 'Hans Frode - Tor Per' (or three on a side) and results like 'AADB'
 * (one letter per game; '' = started without games). Matches are numbered 1… per night.
 * @param {{ date: string, players?: string[], matches: [string, string][] }[]} nights
 */
export function history(nights) {
  const ds = dataset();
  const names = new Set();
  for (const { date, players, matches } of nights) {
    const roster = new Set(players ?? []);
    for (const [n, [seats, results]] of matches.entries()) {
      const matchId = makeMatchId(date, n + 1);
      const seated = seatsOf(seats);
      ds.matches.push({ matchId, date, ...seated });
      playersOf(seated).forEach((name) => roster.add(name));
      [...results].forEach((result, i) => ds.games.push({ matchId, gameNo: i + 1, result, timestamp: `${date}T20:00:00Z` }));
    }
    roster.forEach((name) => names.add(name));
    ds.nights.push({ date, players: [...roster] });
  }
  ds.players = [...names].map((name) => ({ name, active: true }));
  return ds;
}

/** Facts of a compact history (see `history`). */
export const factsOf = (nights, filter = ALL) => buildFacts(history(nights), filter);

export const HF_TP = 'Hans Frode - Tor Per';
export const HT_FP = 'Hans Tor - Frode Per';
export const HP_FT = 'Hans Per - Frode Tor';

/** Computes a registered stat and checks a non-null value against its kind. */
export function compute(id, facts, subject) {
  const stat = statById(id);
  assert.ok(stat, `stat ${id} is registered`);
  const value = stat.compute(facts, subject);
  if (value !== null) assert.ok(isValidValue(stat.kind, value), `${id}: ${JSON.stringify(value)}`);
  return value;
}
