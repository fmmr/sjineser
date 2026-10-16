/**
 * One-off import of the old "Logg" history into the Sjineser sheet (spec §18).
 * Reads import/logg.csv and import/spillere.csv (git-ignored), converts them to ops with
 * scripts/import/convert.mjs and checks every op with applyOp. Node built-ins only.
 *
 *   npm run import:history                                   dry run: prints a summary, no network
 *   SJINESER_PIN=… npm run import:history -- --apply         posts the ops to the live API
 *
 * --apply reads API_URL from docs/js/config.js and refuses unless the sheet has no nights,
 * matches or games (players may exist; addPlayer is idempotent). Ops are posted strictly in
 * order; busy / server / network errors are retried with backoff, noop counts as success,
 * pin / conflict / invalid abort. Afterwards the sheet is read again and compared.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rateGames, isProvisional } from '../docs/js/domain/elo.js';
import { gamesOf, isComplete, matchesOfNight, score, teamOf } from '../docs/js/domain/match.js';
import { findPlayer, playerOverview } from '../docs/js/domain/players.js';
import { convert, norwegianDate } from './import/convert.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILES = { logg: `${ROOT}import/logg.csv`, spillere: `${ROOT}import/spillere.csv` };
const CONFIG_PATH = `${ROOT}docs/js/config.js`;

const RETRYABLE = new Set(['busy', 'server', 'network']);
const MAX_TRIES = 5;
const BACKOFF_MS = 1000;
const TIMEOUT_MS = 30000;
const PROGRESS_EVERY = 10;

/** The API_URL constant from the source of docs/js/config.js. @param {string} source */
export function parseApiUrl(source) {
  const m = /export const API_URL\s*=\s*(['"`])([^'"`]*)\1/.exec(source);
  if (!m || !m[2]) throw new Error('API_URL not found (or empty) in docs/js/config.js');
  return m[2];
}

const fmtRating = (r) => Math.round(r).toString();
const pct = (n, d) => (d === 0 ? '0.0' : ((100 * n) / d).toFixed(1));

/** One line per match: `13.10.2026  #1  Ann + Bo  2–3  Cy + Di  (2 U)  incomplete`. */
function matchLine(dataset, match) {
  const games = gamesOf(dataset, match.matchId);
  const s = score(games);
  const draws = s.D ? `  (${s.D} U)` : '';
  const open = isComplete(games) ? '' : '  incomplete';
  const n = match.matchId.split('#')[1];
  return `${norwegianDate(match.date)}  #${n}  ${teamOf(match, 'A').join(' + ')}  ${s.A}–${s.B}  ${teamOf(match, 'B').join(' + ')}${draws}${open}`;
}

/** The dry-run report as lines. @param {ReturnType<typeof convert>} converted */
export function summary({ dataset, ops }) {
  const out = [];
  const overview = playerOverview(dataset);
  out.push(`Players (${overview.length}):`);
  for (const p of overview) out.push(`  ${p.name.padEnd(20)} ${String(p.games).padStart(4)} games`);

  out.push('', `Nights (${dataset.nights.length}):`);
  for (const night of [...dataset.nights].sort((a, b) => a.date.localeCompare(b.date))) {
    const matches = matchesOfNight(dataset, night.date);
    const games = matches.reduce((n, m) => n + gamesOf(dataset, m.matchId).length, 0);
    out.push('', `${norwegianDate(night.date)}: ${matches.length} matches, ${games} games — ${night.players.join(', ')}`);
    for (const match of matches) out.push(`  ${matchLine(dataset, match)}`);
  }

  const incomplete = dataset.matches.filter((m) => !isComplete(gamesOf(dataset, m.matchId)));
  const draws = dataset.games.filter((g) => g.result === 'D').length;
  out.push('', 'Totals:',
    `  players ${dataset.players.length}, nights ${dataset.nights.length}, matches ${dataset.matches.length}, games ${dataset.games.length}, ops ${ops.length}`,
    `  draws ${draws} of ${dataset.games.length} games (${pct(draws, dataset.games.length)} %)`);

  out.push('', `Incomplete matches (${incomplete.length}):`);
  for (const match of incomplete) out.push(`  ${matchLine(dataset, match)}`);

  const rated = rateGames(dataset);
  const board = [...rated.ratings].sort((a, b) => b[1] - a[1]);
  out.push('', 'Elo leaderboard (* = provisional, under 10 games):');
  board.forEach(([name, rating], i) => {
    const mark = isProvisional(rated, name) ? '*' : ' ';
    out.push(`  ${String(i + 1).padStart(2)}. ${name.padEnd(20)} ${fmtRating(rating).padStart(5)}${mark} ${String(rated.gamesPlayed.get(name)).padStart(4)} games`);
  });
  return out;
}

// ---------- Network (--apply) ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One request as an envelope; network failures and non-JSON replies become { error: 'network' }. */
async function request(url, init) {
  try {
    const response = await fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      if (typeof body?.ok === 'boolean') return body;
    } catch { /* fall through */ }
    return { ok: false, error: 'network', message: `Non-JSON reply (HTTP ${response.status})` };
  } catch (err) {
    return { ok: false, error: 'network', message: String(err?.message ?? err) };
  }
}

/** GET with retries; throws if it never succeeds. */
async function getAll(url) {
  for (let attempt = 1; ; attempt += 1) {
    const reply = await request(url, { method: 'GET', cache: 'no-store' });
    if (reply.ok) return reply.data;
    if (!RETRYABLE.has(reply.error) || attempt >= MAX_TRIES) throw new Error(`GET failed: ${reply.error}: ${reply.message}`);
    await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }
}

/** POST one op with retries; returns 'applied' | 'noop' or throws. */
async function post(url, op, pin, index) {
  // text/plain body, no custom headers: same CORS-simple request as docs/js/api/client.js.
  const body = JSON.stringify({ action: op.action, payload: op.payload, pin });
  for (let attempt = 1; ; attempt += 1) {
    const reply = await request(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    if (reply.ok) return reply.result;
    const where = `op ${index + 1} ${op.action} ${JSON.stringify(op.payload)}`;
    if (reply.error === 'pin') throw new Error(`Wrong PIN (check SJINESER_PIN) at ${where}`);
    if (!RETRYABLE.has(reply.error)) throw new Error(`Aborted: ${reply.error} (${reply.message}) at ${where}`);
    if (attempt >= MAX_TRIES) throw new Error(`Gave up after ${MAX_TRIES} tries: ${reply.error} (${reply.message}) at ${where}`);
    const wait = BACKOFF_MS * 2 ** (attempt - 1);
    console.log(`  ${reply.error} at op ${index + 1}, retrying in ${wait / 1000}s (try ${attempt + 1}/${MAX_TRIES})`);
    await sleep(wait);
  }
}

const counts = (data) => `players ${data.players.length}, nights ${data.nights.length}, matches ${data.matches.length}, games ${data.games.length}`;

async function apply({ dataset, ops }) {
  const pin = process.env.SJINESER_PIN;
  if (!pin) throw new Error('--apply needs the write PIN in env SJINESER_PIN');
  const url = parseApiUrl(readFileSync(CONFIG_PATH, 'utf8'));

  const before = await getAll(url);
  console.log(`Sheet now: ${counts(before)}`);
  if (before.nights.length || before.matches.length || before.games.length) {
    console.error('Refusing to import: the sheet already has nights, matches or games.');
    console.error('Run resetAllData() and then setup() in the Apps Script editor first (spec §18).');
    process.exitCode = 1;
    return;
  }

  const tally = { applied: 0, noop: 0 };
  for (const [i, op] of ops.entries()) {
    const result = await post(url, op, pin, i);
    tally[result] = (tally[result] ?? 0) + 1;
    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === ops.length) {
      console.log(`  ${i + 1}/${ops.length} ops (applied ${tally.applied}, noop ${tally.noop})`);
    }
  }

  const after = await getAll(url);
  console.log(`Sheet after: ${counts(after)}`);
  const problems = [];
  const missing = dataset.players.filter((p) => !findPlayer(after.players, p.name)).map((p) => p.name);
  if (missing.length) problems.push(`players missing: ${missing.join(', ')}`);
  for (const key of ['nights', 'matches', 'games']) {
    if (after[key].length !== dataset[key].length) problems.push(`${key}: sheet ${after[key].length}, expected ${dataset[key].length}`);
  }
  if (problems.length) throw new Error(`Verification failed:\n  ${problems.join('\n  ')}`);
  console.log('Verified: the sheet matches the converted history.');
}

async function main() {
  const applyMode = process.argv.includes('--apply');
  const converted = convert({ logg: readFileSync(FILES.logg, 'utf8'), spillere: readFileSync(FILES.spillere, 'utf8') });
  console.log(summary(converted).join('\n'));
  if (!applyMode) {
    console.log('\nDry run: nothing was sent. Apply with SJINESER_PIN=… npm run import:history -- --apply');
    return;
  }
  console.log('\nApplying to the live sheet…');
  await apply(converted);
}

// Run as a script (also through a symlinked path), not when imported by the tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
