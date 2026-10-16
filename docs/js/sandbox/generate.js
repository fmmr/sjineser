import { applyOp, emptyDataset } from '../domain/dataset.js';
import { ELO, expectedScore, rateGames } from '../domain/elo.js';
import { WINS_NEEDED, makeMatchId, seatsOf } from '../domain/match.js';
import { byName } from '../domain/players.js';
import { proposeTeams } from '../domain/proposal.js';
import { createRandom } from './random.js';

export const SANDBOX_SEED = 1;
export const SANDBOX_PLAYERS = ['Anne', 'Bjørn', 'Cato', 'Dag', 'Erik', 'Frida'];

/** Hidden skill per player as an offset from ELO.START. Never stored; only drives results. */
const SKILL = { Anne: 200, Bjørn: 110, Cato: 40, Dag: -40, Erik: -110, Frida: -200 };

const FIRST_NIGHT = '2025-08-21';
const LAST_NIGHT_BEFORE = '2026-10-01';
const NIGHT_GAP = { min: 14, max: 35 };
const NEXT_DATE_GAP = 14;
const DRAW_PROBABILITY = 0.35;
const ABANDON_PROBABILITY = 0.15;
const ABANDON_AT_WINS = 2;
const MAX_GAMES = 40;

/** Adds days to a YYYY-MM-DD date. UTC, so daylight saving never shifts the day. */
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 4 players (60 %), 5 (30 %) or 6 (10 %); proposeTeams plays them 2 + 2, 3 + 2 and 3 + 3. */
function rosterSize(random) {
  const roll = random.next();
  return roll < 0.6 ? 4 : roll < 0.9 ? 5 : 6;
}

const teamSkill = (team) => team.reduce((total, name) => total + ELO.START + SKILL[name], 0) / team.length;

/**
 * Generates a deterministic, valid history by folding ops through applyOp.
 * @param {number} [seed]
 * @returns {{ dataset: import('../domain/match.js').Dataset, nextDate: string }}
 *   nextDate: a sensible pretend "today", two weeks after the last night
 */
export function generateHistory(seed = SANDBOX_SEED) {
  const random = createRandom(seed);
  let dataset = emptyDataset();
  const apply = (action, payload) => {
    const { dataset: next, outcome } = applyOp(dataset, { action, payload });
    if (outcome !== 'applied') throw new Error(`Sandbox generator: ${action} ${JSON.stringify(payload)} → ${outcome}`);
    dataset = next;
  };

  for (const name of SANDBOX_PLAYERS) apply('addPlayer', { name });

  let date = FIRST_NIGHT;
  let lastNight = date;
  while (date < LAST_NIGHT_BEFORE) {
    const players = random.shuffle(SANDBOX_PLAYERS).slice(0, rosterSize(random)).sort(byName);
    apply('startNight', { date, players });
    const matchCount = random.chance(0.7) ? 3 : 4;
    for (let n = 1; n <= matchCount; n += 1) {
      const abandonable = n === matchCount && random.chance(ABANDON_PROBABILITY);
      playMatch(date, n, abandonable);
    }
    lastNight = date;
    date = addDays(date, random.int(NIGHT_GAP.min, NIGHT_GAP.max));
  }
  return { dataset, nextDate: addDays(lastNight, NEXT_DATE_GAP) };

  function playMatch(date, number, abandonable) {
    const { A, B } = proposeTeams(dataset, rateGames(dataset));
    const matchId = makeMatchId(date, number);
    apply('startMatch', { matchId, date, ...seatsOf(A, B) });
    const winA = expectedScore(teamSkill(A), teamSkill(B));
    const wins = { A: 0, B: 0 };
    const stopAt = abandonable ? ABANDON_AT_WINS : WINS_NEEDED;
    for (let gameNo = 1; gameNo <= MAX_GAMES && Math.max(wins.A, wins.B) < stopAt; gameNo += 1) {
      const result = random.chance(DRAW_PROBABILITY) ? 'D' : random.chance(winA) ? 'A' : 'B';
      if (result !== 'D') wins[result] += 1;
      const minute = String(Math.min(2 * gameNo, 59)).padStart(2, '0');
      apply('addGame', { matchId, gameNo, result, timestamp: `${date}T20:${minute}:00Z` });
    }
  }
}
