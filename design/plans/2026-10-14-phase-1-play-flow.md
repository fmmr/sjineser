# Sjineser Phase 1 — Backend, Sync and Play Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile web app where players start a night, pick teams manually, record game results and undo, with every action stored in a private Google Sheet through an Apps Script API and an offline-tolerant outbox.

**Architecture:** Static site in `docs/` (GitHub Pages). Pure domain functions (`docs/js/domain/`) hold all rules; `docs/js/state/` holds persistence, the outbox and user actions; `docs/js/views/` only render. The only backend code is a thin standalone Apps Script (`apps-script/Code.js`) that validates, locks and reads/writes sheet rows. Spec: `design/specs/2026-10-14-sjineser-design.md`.

**Tech Stack:** Plain HTML/CSS/JavaScript ES modules (no build, no runtime deps), JSDoc types, Node 26 built-in test runner (`node --test`), Google Apps Script (V8) + `clasp`.

**Out of scope for this phase:** team proposals and Elo (phase 2), statistics (phase 3), manifest/service worker (phase 4). The new-match screen picks teams manually.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | `npm test`, `npm run serve` |
| `tests/helpers.js` | in-memory storage backend, dataset fixtures |
| `docs/js/domain/dates.js` | local ISO dates |
| `docs/js/domain/players.js` | name rules, lookup, sorting |
| `docs/js/domain/match.js` | match ids, canonical order, score, winner, current night/match |
| `docs/js/domain/dataset.js` | `applyOp`: idempotent op application (mirrors server) |
| `docs/js/api/client.js` | fetch wrapper; the only code that knows the backend |
| `docs/js/state/storage.js` | JSON wrapper over `localStorage` |
| `docs/js/state/outbox.js` | persistent queue, serial flush, retry, cascade drops |
| `docs/js/state/store.js` | server dataset + pending ops → view; refresh; subscribe |
| `docs/js/state/actions.js` | user intents → validated ops; undo |
| `apps-script/Code.js` | `doGet`, `doPost`, `setup` |
| `apps-script/appsscript.json` | manifest (V8, web app access) |
| `docs/index.html` | markup shell |
| `docs/CNAME` | custom domain |
| `docs/css/tokens.css` | design tokens, dark default + light override |
| `docs/css/base.css` | reset, typography |
| `docs/css/layout.css` | header, main, tab bar, safe areas |
| `docs/css/components.css` | buttons, cards, chips, badge, toasts, fields |
| `docs/css/views/play.css` | play screens |
| `docs/js/config.js` | API URL, poll interval |
| `docs/js/i18n/nb.js` | all Norwegian UI text, date formatting |
| `docs/js/router.js` | hash router |
| `docs/js/main.js` | composition root |
| `docs/js/views/components/dom.js` | `h()` element helper |
| `docs/js/views/components/toast.js` | toasts |
| `docs/js/views/components/pin-prompt.js` | PIN prompt |
| `docs/js/views/shell.js` | tab labels, active tab, sync badge |
| `docs/js/views/sync-messages.js` | text for dropped ops |
| `docs/js/views/routes.js` | path → view |
| `docs/js/views/play/home.js` | continue / new night |
| `docs/js/views/play/start-night.js` | pick roster, add player |
| `docs/js/views/play/new-match.js` | assign teams manually |
| `docs/js/views/play/match.js` | score, record, undo, winner |
| `docs/js/views/stats/stats.js` | placeholder until phase 3 |

Conventions for every JS file: ES module, 2-space indent, single quotes, semicolons, JSDoc on exported functions, no default exports.

---

### Task 1: Repository scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `tests/helpers.js`, `tests/smoke.test.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sjineser",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000 --directory docs"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
.clasprc.json
```

- [ ] **Step 3: Create `tests/helpers.js`**

```js
/** In-memory stand-in for window.localStorage. */
export function memoryBackend() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

export const DATE = '2026-10-14';
export const FOUR = ['Frode', 'Hans', 'Per', 'Tor'];
export const MATCH_1 = `${DATE}#1`;

export function dataset(overrides = {}) {
  return { players: [], nights: [], matches: [], games: [], ...overrides };
}

export const game = (matchId, gameNo, result) => ({ matchId, gameNo, result, timestamp: `${DATE}T20:00:00Z` });

/** Four players, one night, match #1 (Hans & Frode vs Tor & Per) with the given results. */
export function nightWithMatch(results = []) {
  return dataset({
    players: FOUR.map((name) => ({ name, active: true })),
    nights: [{ date: DATE, players: FOUR }],
    matches: [{ matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' }],
    games: results.map((result, i) => game(MATCH_1, i + 1, result)),
  });
}
```

- [ ] **Step 4: Create `tests/smoke.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend } from './helpers.js';

test('memory backend stores strings', () => {
  const backend = memoryBackend();
  backend.setItem('k', 1);
  assert.equal(backend.getItem('k'), '1');
  assert.equal(backend.getItem('missing'), null);
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: summary lines `ℹ pass 1` and `ℹ fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore tests/
git commit -m "chore: scaffold test setup"
```

---

### Task 2: Dates and player rules

**Files:**
- Create: `docs/js/domain/dates.js`, `docs/js/domain/players.js`
- Test: `tests/domain/dates.test.js`, `tests/domain/players.test.js`

- [ ] **Step 1: Write failing tests**

`tests/domain/dates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isISODate, toISODate } from '../../docs/js/domain/dates.js';

test('toISODate uses local date with zero padding', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('isISODate accepts only YYYY-MM-DD', () => {
  assert.equal(isISODate('2026-10-14'), true);
  assert.equal(isISODate('14.10.2026'), false);
  assert.equal(isISODate(''), false);
});
```

`tests/domain/players.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePlayers, findPlayer, nameFormatError, validateNewName } from '../../docs/js/domain/players.js';

const players = [
  { name: 'Hans', active: true },
  { name: 'Åse', active: true },
  { name: 'Ærlend', active: true },
  { name: 'Ola', active: true },
  { name: 'Gamle', active: false },
];

test('findPlayer is case-insensitive and ignores surrounding space', () => {
  assert.equal(findPlayer(players, '  hANS ').name, 'Hans');
  assert.equal(findPlayer(players, 'Nobody'), null);
});

test('nameFormatError rejects empty and comma names', () => {
  assert.equal(nameFormatError('   '), 'empty');
  assert.equal(nameFormatError('Per, Pål'), 'comma');
  assert.equal(nameFormatError(' Kari '), null);
});

test('validateNewName also rejects duplicates', () => {
  assert.equal(validateNewName('hans', players), 'duplicate');
  assert.equal(validateNewName('Kari', players), null);
});

test('activePlayers drops inactive and sorts in Norwegian order', () => {
  assert.deepEqual(activePlayers(players).map((p) => p.name), ['Hans', 'Ola', 'Ærlend', 'Åse']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../docs/js/domain/dates.js'`

- [ ] **Step 3: Implement `docs/js/domain/dates.js`**

```js
/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD in local time
 */
export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @param {string} value */
export const isISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
```

- [ ] **Step 4: Implement `docs/js/domain/players.js`**

```js
/** @typedef {{ name: string, active: boolean }} Player */

const key = (name) => name.trim().toLocaleLowerCase('nb');

/** @param {string} a @param {string} b */
export const byName = (a, b) => a.localeCompare(b, 'nb');

/**
 * @param {Player[]} players
 * @param {string} name
 * @returns {Player | null}
 */
export function findPlayer(players, name) {
  const wanted = key(name);
  return players.find((p) => key(p.name) === wanted) ?? null;
}

/**
 * Names are trimmed, non-empty and comma-free (Nights joins names with ", ").
 * @returns {null | 'empty' | 'comma'}
 */
export function nameFormatError(raw) {
  const name = raw.trim();
  if (!name) return 'empty';
  if (name.includes(',')) return 'comma';
  return null;
}

/** @returns {null | 'empty' | 'comma' | 'duplicate'} */
export function validateNewName(raw, players) {
  return nameFormatError(raw) ?? (findPlayer(players, raw) ? 'duplicate' : null);
}

/** @param {Player[]} players */
export const activePlayers = (players) => players.filter((p) => p.active).sort((a, b) => byName(a.name, b.name));
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add docs/js/domain tests/domain
git commit -m "feat(domain): dates and player name rules"
```

---

### Task 3: Match rules

**Files:**
- Create: `docs/js/domain/match.js`
- Test: `tests/domain/match.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareGames, currentMatch, currentNight, isValidMatchId, latestMatch, makeMatchId,
  nextGameNo, nextMatchId, parseMatchId, score, validSeats, winnerOf,
} from '../../docs/js/domain/match.js';
import { DATE, FOUR, MATCH_1, dataset, game, nightWithMatch } from '../helpers.js';

const withMatches = (base, numbers) => ({
  ...base,
  matches: numbers.map((n) => ({ matchId: makeMatchId(DATE, n), date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' })),
});

test('match ids round-trip and validate', () => {
  assert.deepEqual(parseMatchId(makeMatchId(DATE, 12)), { date: DATE, number: 12 });
  assert.equal(isValidMatchId('2026-10-14#3'), true);
  assert.equal(isValidMatchId('2026-10-14-3'), false);
});

test('compareGames orders by date, numeric match number, game number', () => {
  const games = [game('2026-10-14#10', 1, 'A'), game('2026-10-14#2', 2, 'A'), game('2026-10-14#2', 1, 'A'), game('2026-09-01#5', 1, 'A')];
  assert.deepEqual(
    [...games].sort(compareGames).map((g) => `${g.matchId}/${g.gameNo}`),
    ['2026-09-01#5/1', '2026-10-14#2/1', '2026-10-14#2/2', '2026-10-14#10/1'],
  );
});

test('score counts each result', () => {
  assert.deepEqual(score(nightWithMatch(['A', 'D', 'B', 'D']).games), { A: 1, B: 1, D: 2 });
});

test('winnerOf returns the first team to three wins', () => {
  assert.equal(winnerOf(nightWithMatch(['A', 'A', 'D', 'B', 'A']).games), 'A');
  assert.equal(winnerOf(nightWithMatch(['A', 'B', 'A', 'B', 'D']).games), null);
});

test('validSeats requires four distinct non-empty names', () => {
  assert.equal(validSeats({ A1: 'a', A2: 'b', B1: 'c', B2: 'd' }), true);
  assert.equal(validSeats({ A1: 'a', A2: 'a', B1: 'c', B2: 'd' }), false);
  assert.equal(validSeats({ A1: 'a', A2: '', B1: 'c', B2: 'd' }), false);
});

test('currentNight is the latest by date, not by row order', () => {
  const ds = dataset({ nights: [{ date: '2026-10-14', players: FOUR }, { date: '2026-09-01', players: FOUR }] });
  assert.equal(currentNight(ds).date, '2026-10-14');
  assert.equal(currentNight(dataset()), null);
});

test('latestMatch is the highest-numbered match of the current night', () => {
  const ds = withMatches(nightWithMatch(), [2, 10, 1]);
  assert.equal(latestMatch(ds).matchId, `${DATE}#10`);
});

test('currentMatch ignores an abandoned earlier match once a later one is complete', () => {
  const ds = withMatches(nightWithMatch(), [1, 2, 3]);
  ds.games = [game(`${DATE}#2`, 1, 'A'), ...['B', 'B', 'B'].map((r, i) => game(`${DATE}#3`, i + 1, r))];
  assert.equal(currentMatch(ds), null);
});

test('currentMatch returns the latest match while incomplete', () => {
  assert.equal(currentMatch(nightWithMatch(['A', 'D'])).matchId, MATCH_1);
});

test('nextMatchId counts numerically within the night', () => {
  assert.equal(nextMatchId(dataset(), DATE), `${DATE}#1`);
  assert.equal(nextMatchId(withMatches(nightWithMatch(), [1, 9]), DATE), `${DATE}#10`);
});

test('nextGameNo is one past the highest game number', () => {
  assert.equal(nextGameNo([]), 1);
  assert.equal(nextGameNo([game(MATCH_1, 1, 'A'), game(MATCH_1, 3, 'D')]), 4);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module `match.js` not found.

- [ ] **Step 3: Implement `docs/js/domain/match.js`**

```js
/** @typedef {{ date: string, players: string[] }} Night */
/** @typedef {{ matchId: string, date: string, A1: string, A2: string, B1: string, B2: string }} Match */
/** @typedef {{ matchId: string, gameNo: number, result: 'A' | 'B' | 'D', timestamp: string }} Game */
/** @typedef {{ players: import('./players.js').Player[], nights: Night[], matches: Match[], games: Game[] }} Dataset */

export const WINS_NEEDED = 3;
export const SEATS = ['A1', 'A2', 'B1', 'B2'];

/** @param {string} date @param {number} number */
export const makeMatchId = (date, number) => `${date}#${number}`;

/** @param {string} matchId */
export const isValidMatchId = (matchId) => /^\d{4}-\d{2}-\d{2}#\d+$/.test(matchId);

/** @param {string} matchId @returns {{ date: string, number: number }} */
export function parseMatchId(matchId) {
  const [date, number] = matchId.split('#');
  return { date, number: Number(number) };
}

const matchNumber = (match) => parseMatchId(match.matchId).number;

/** Canonical game order used everywhere: night date, numeric match number, game number. */
export function compareGames(a, b) {
  const x = parseMatchId(a.matchId);
  const y = parseMatchId(b.matchId);
  return x.date.localeCompare(y.date) || x.number - y.number || a.gameNo - b.gameNo;
}

/** @param {Dataset} dataset @param {string} matchId @returns {Game[]} in game order */
export const gamesOf = (dataset, matchId) =>
  dataset.games.filter((g) => g.matchId === matchId).sort((a, b) => a.gameNo - b.gameNo);

/** @param {Game[]} games */
export function score(games) {
  const totals = { A: 0, B: 0, D: 0 };
  for (const { result } of games) totals[result] += 1;
  return totals;
}

/** First team to reach WINS_NEEDED, or null. @param {Game[]} games in game order */
export function winnerOf(games) {
  const wins = { A: 0, B: 0 };
  for (const { result } of games) {
    if (result === 'D') continue;
    wins[result] += 1;
    if (wins[result] === WINS_NEEDED) return result;
  }
  return null;
}

/** @param {Game[]} games */
export const isComplete = (games) => winnerOf(games) !== null;

/** Four distinct, non-empty player names. */
export function validSeats(match) {
  const names = SEATS.map((seat) => match[seat]);
  return names.every(Boolean) && new Set(names).size === SEATS.length;
}

export const sameSeats = (a, b) => SEATS.every((seat) => a[seat] === b[seat]);

/** @param {Match} match @param {'A' | 'B'} side */
export const teamOf = (match, side) => (side === 'A' ? [match.A1, match.A2] : [match.B1, match.B2]);

/** The night with the latest date. @param {Dataset} dataset */
export const currentNight = (dataset) =>
  dataset.nights.reduce((latest, night) => (!latest || night.date > latest.date ? night : latest), null);

/** @param {Dataset} dataset @param {string} date */
export const matchesOfNight = (dataset, date) =>
  dataset.matches.filter((m) => m.date === date).sort((a, b) => matchNumber(a) - matchNumber(b));

/** Highest-numbered match of the current night. */
export function latestMatch(dataset) {
  const night = currentNight(dataset);
  return night ? (matchesOfNight(dataset, night.date).at(-1) ?? null) : null;
}

/** The latest match if it is incomplete; otherwise null. */
export function currentMatch(dataset) {
  const match = latestMatch(dataset);
  return match && !isComplete(gamesOf(dataset, match.matchId)) ? match : null;
}

/** @param {Dataset} dataset @param {string} date */
export function nextMatchId(dataset, date) {
  const last = matchesOfNight(dataset, date).at(-1);
  return makeMatchId(date, last ? matchNumber(last) + 1 : 1);
}

/** @param {Game[]} games */
export const nextGameNo = (games) => games.reduce((max, g) => Math.max(max, g.gameNo), 0) + 1;
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/domain/match.js tests/domain/match.test.js
git commit -m "feat(domain): match ids, ordering, score and current match"
```

---

### Task 4: Idempotent op application

`applyOp` is used for optimistic local state and local validation. Its rules must match `apps-script/Code.js` (Task 8) exactly.

**Files:**
- Create: `docs/js/domain/dataset.js`
- Test: `tests/domain/dataset.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp } from '../../docs/js/domain/dataset.js';
import { DATE, FOUR, MATCH_1, dataset, nightWithMatch } from '../helpers.js';

const op = (action, payload) => ({ action, payload });
const outcome = (ds, action, payload) => applyOp(ds, op(action, payload)).outcome;
const seats = { A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' };

test('addPlayer trims, dedupes case-insensitively and rejects bad names', () => {
  const { dataset: ds, outcome: o } = applyOp(dataset(), op('addPlayer', { name: '  Kari ' }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.players, [{ name: 'Kari', active: true }]);
  assert.equal(outcome(ds, 'addPlayer', { name: 'kari' }), 'noop');
  assert.equal(outcome(ds, 'addPlayer', { name: 'A, B' }), 'invalid');
  assert.equal(outcome(ds, 'addPlayer', { name: ' ' }), 'invalid');
});

test('startNight: applied, noop for same roster in any order, conflict for another roster', () => {
  const { dataset: ds } = applyOp(dataset(), op('startNight', { date: DATE, players: FOUR }));
  assert.equal(ds.nights.length, 1);
  assert.equal(outcome(ds, 'startNight', { date: DATE, players: [...FOUR].reverse() }), 'noop');
  assert.equal(outcome(ds, 'startNight', { date: DATE, players: [...FOUR, 'Kari'] }), 'conflict');
  assert.equal(outcome(dataset(), 'startNight', { date: DATE, players: FOUR.slice(0, 3) }), 'invalid');
});

test('startMatch: applied, noop if identical, conflict if seats differ, invalid seats rejected', () => {
  const base = nightWithMatch();
  const id2 = `${DATE}#2`;
  assert.equal(outcome(base, 'startMatch', { matchId: id2, date: DATE, ...seats }), 'applied');
  assert.equal(outcome(base, 'startMatch', { matchId: MATCH_1, date: DATE, ...seats }), 'noop');
  assert.equal(outcome(base, 'startMatch', { matchId: MATCH_1, date: DATE, ...seats, A2: 'Tor', B1: 'Frode' }), 'conflict');
  assert.equal(outcome(base, 'startMatch', { matchId: id2, date: DATE, ...seats, A2: 'Hans' }), 'invalid');
  assert.equal(outcome(base, 'startMatch', { matchId: 'bad', date: DATE, ...seats }), 'invalid');
});

test('addGame: applied, noop for same result, conflict for different, invalid for unknown match or result', () => {
  const g = { matchId: MATCH_1, gameNo: 1, result: 'D', timestamp: 'T' };
  const { dataset: ds, outcome: o } = applyOp(nightWithMatch(), op('addGame', g));
  assert.equal(o, 'applied');
  assert.equal(outcome(ds, 'addGame', g), 'noop');
  assert.equal(outcome(ds, 'addGame', { ...g, result: 'A' }), 'conflict');
  assert.equal(outcome(ds, 'addGame', { ...g, matchId: `${DATE}#9` }), 'invalid');
  assert.equal(outcome(ds, 'addGame', { ...g, gameNo: 2, result: 'X' }), 'invalid');
});

test('deleteGame removes the game or is a noop', () => {
  const ds = nightWithMatch(['A', 'B']);
  const { dataset: after, outcome: o } = applyOp(ds, op('deleteGame', { matchId: MATCH_1, gameNo: 2 }));
  assert.equal(o, 'applied');
  assert.deepEqual(after.games.map((g) => g.gameNo), [1]);
  assert.equal(outcome(after, 'deleteGame', { matchId: MATCH_1, gameNo: 2 }), 'noop');
});

test('deleteMatch only for matches without games', () => {
  assert.equal(outcome(nightWithMatch(['A']), 'deleteMatch', { matchId: MATCH_1 }), 'invalid');
  assert.equal(outcome(nightWithMatch(), 'deleteMatch', { matchId: MATCH_1 }), 'applied');
  assert.equal(outcome(nightWithMatch(), 'deleteMatch', { matchId: `${DATE}#7` }), 'noop');
});

test('unknown actions are invalid and input is never mutated', () => {
  const ds = nightWithMatch(['A']);
  const snapshot = structuredClone(ds);
  assert.equal(outcome(ds, 'dropTable', {}), 'invalid');
  applyOp(ds, op('addGame', { matchId: MATCH_1, gameNo: 2, result: 'B', timestamp: 'T' }));
  applyOp(ds, op('deleteGame', { matchId: MATCH_1, gameNo: 1 }));
  assert.deepEqual(ds, snapshot);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module `dataset.js` not found.

- [ ] **Step 3: Implement `docs/js/domain/dataset.js`**

```js
import { isISODate } from './dates.js';
import { findPlayer, nameFormatError } from './players.js';
import { isValidMatchId, sameSeats, validSeats } from './match.js';

/** @typedef {'applied' | 'noop' | 'conflict' | 'invalid'} Outcome */
/** @typedef {{ action: string, payload: object }} Op */

export const RESULTS = ['A', 'B', 'D'];

/** @returns {import('./match.js').Dataset} */
export const emptyDataset = () => ({ players: [], nights: [], matches: [], games: [] });

/**
 * Applies an op without mutating the input. Rules mirror apps-script/Code.js so that
 * optimistic local state matches what the sheet will contain.
 * @param {import('./match.js').Dataset} dataset
 * @param {Op} op
 * @returns {{ dataset: import('./match.js').Dataset, outcome: Outcome }}
 */
export function applyOp(dataset, op) {
  const handler = HANDLERS[op.action];
  return handler ? handler(dataset, op.payload) : unchanged(dataset, 'invalid');
}

const unchanged = (dataset, outcome) => ({ dataset, outcome });
const changed = (dataset, patch) => ({ dataset: { ...dataset, ...patch }, outcome: 'applied' });
const sameMembers = (a, b) => a.length === b.length && a.every((name) => b.includes(name));
const isGame = (matchId, gameNo) => (g) => g.matchId === matchId && g.gameNo === gameNo;

const HANDLERS = {
  addPlayer(ds, { name }) {
    if (nameFormatError(name)) return unchanged(ds, 'invalid');
    if (findPlayer(ds.players, name)) return unchanged(ds, 'noop');
    return changed(ds, { players: [...ds.players, { name: name.trim(), active: true }] });
  },

  startNight(ds, { date, players }) {
    const existing = ds.nights.find((n) => n.date === date);
    if (existing) return unchanged(ds, sameMembers(existing.players, players) ? 'noop' : 'conflict');
    if (!isISODate(date) || players.length < 4 || new Set(players).size !== players.length) {
      return unchanged(ds, 'invalid');
    }
    return changed(ds, { nights: [...ds.nights, { date, players: [...players] }] });
  },

  startMatch(ds, { matchId, date, A1, A2, B1, B2 }) {
    const match = { matchId, date, A1, A2, B1, B2 };
    const existing = ds.matches.find((m) => m.matchId === matchId);
    if (existing) return unchanged(ds, sameSeats(existing, match) ? 'noop' : 'conflict');
    if (!isValidMatchId(matchId) || !validSeats(match)) return unchanged(ds, 'invalid');
    return changed(ds, { matches: [...ds.matches, match] });
  },

  addGame(ds, { matchId, gameNo, result, timestamp }) {
    if (!RESULTS.includes(result) || !ds.matches.some((m) => m.matchId === matchId)) {
      return unchanged(ds, 'invalid');
    }
    const existing = ds.games.find(isGame(matchId, gameNo));
    if (existing) return unchanged(ds, existing.result === result ? 'noop' : 'conflict');
    return changed(ds, { games: [...ds.games, { matchId, gameNo, result, timestamp }] });
  },

  deleteGame(ds, { matchId, gameNo }) {
    const matches = isGame(matchId, gameNo);
    if (!ds.games.some(matches)) return unchanged(ds, 'noop');
    return changed(ds, { games: ds.games.filter((g) => !matches(g)) });
  },

  deleteMatch(ds, { matchId }) {
    if (!ds.matches.some((m) => m.matchId === matchId)) return unchanged(ds, 'noop');
    if (ds.games.some((g) => g.matchId === matchId)) return unchanged(ds, 'invalid');
    return changed(ds, { matches: ds.matches.filter((m) => m.matchId !== matchId) });
  },
};
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/domain/dataset.js tests/domain/dataset.test.js
git commit -m "feat(domain): idempotent applyOp mirroring server rules"
```

---

### Task 5: API client

**Files:**
- Create: `docs/js/api/client.js`
- Test: `tests/api/client.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../../docs/js/api/client.js';

function fakeFetch(respond) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetchFn };
}
const jsonResponse = (body) => ({ json: async () => body });

test('getAll does an uncached GET and returns the envelope', async () => {
  const { calls, fetchFn } = fakeFetch(() => jsonResponse({ ok: true, data: { players: [] } }));
  const api = createApiClient({ url: 'https://x/exec', fetchFn });
  assert.deepEqual(await api.getAll(), { ok: true, data: { players: [] } });
  assert.equal(calls[0].url, 'https://x/exec');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('post sends action, payload and pin as a JSON string without headers', async () => {
  const { calls, fetchFn } = fakeFetch(() => jsonResponse({ ok: true, result: 'applied' }));
  const api = createApiClient({ url: 'u', fetchFn });
  await api.post('addPlayer', { name: 'Kari' }, '1234');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'addPlayer', payload: { name: 'Kari' }, pin: '1234' });
});

test('network failures and non-envelope replies become a network error', async () => {
  const failing = createApiClient({ url: 'u', fetchFn: async () => { throw new TypeError('offline'); } });
  assert.equal((await failing.getAll()).error, 'network');
  const html = createApiClient({ url: 'u', fetchFn: async () => ({ json: async () => { throw new SyntaxError(); } }) });
  assert.equal((await html.getAll()).error, 'network');
  const odd = createApiClient({ url: 'u', fetchFn: async () => jsonResponse({ hello: 1 }) });
  assert.equal((await odd.getAll()).error, 'network');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module `client.js` not found.

- [ ] **Step 3: Implement `docs/js/api/client.js`**

```js
const NETWORK_ERROR = Object.freeze({ ok: false, error: 'network', message: 'Network error' });

/**
 * The only module that talks to the backend. Every call resolves to an envelope:
 * { ok: true, result?, data? } or { ok: false, error, message }.
 * @param {{ url: string, fetchFn?: typeof fetch }} options
 */
export function createApiClient({ url, fetchFn = (...args) => globalThis.fetch(...args) }) {
  async function call(init) {
    try {
      const response = await fetchFn(url, init);
      const body = await response.json();
      return typeof body?.ok === 'boolean' ? body : NETWORK_ERROR;
    } catch {
      return NETWORK_ERROR;
    }
  }

  return {
    getAll: () => call({ method: 'GET', cache: 'no-store' }),
    // No custom headers: a string body goes out as text/plain, keeping this a CORS simple request.
    post: (action, payload, pin) => call({ method: 'POST', body: JSON.stringify({ action, payload, pin }) }),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/api tests/api
git commit -m "feat(api): envelope-based Apps Script client"
```

---

### Task 6: Storage and outbox

**Files:**
- Create: `docs/js/state/storage.js`, `docs/js/state/outbox.js`
- Test: `tests/state/storage.test.js`, `tests/state/outbox.test.js`

- [ ] **Step 1: Write failing tests**

`tests/state/storage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../../docs/js/state/storage.js';
import { memoryBackend } from '../helpers.js';

test('storage round-trips JSON under a prefix and falls back on missing or corrupt values', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  storage.set('outbox', [{ id: 1 }]);
  assert.deepEqual(storage.get('outbox', []), [{ id: 1 }]);
  assert.equal(backend.getItem('sjineser:outbox'), '[{"id":1}]');
  assert.equal(storage.get('missing', 'fallback'), 'fallback');
  backend.setItem('sjineser:broken', '{nope');
  assert.equal(storage.get('broken', null), null);
});
```

`tests/state/outbox.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../../docs/js/state/outbox.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { DATE, memoryBackend } from '../helpers.js';

const OK = { ok: true, result: 'applied' };

function setup({ responses = [], storage = createStorage(memoryBackend()) } = {}) {
  const pendingResponses = [...responses];
  const log = { sent: [], committed: [], dropped: [], pinRequests: 0, retries: [], maxConcurrent: 0 };
  let active = 0;
  let id = 0;
  const outbox = createOutbox({
    storage,
    send: async (op) => {
      active += 1;
      log.maxConcurrent = Math.max(log.maxConcurrent, active);
      log.sent.push(op.action);
      await Promise.resolve();
      active -= 1;
      return pendingResponses.shift() ?? OK;
    },
    onSent: (op) => log.committed.push(op.action),
    onDrop: (op, response, dropped) => log.dropped.push(dropped.map((o) => o.action)),
    onPinRequired: () => { log.pinRequests += 1; },
    schedule: (fn, ms) => { log.retries.push({ fn, ms }); return log.retries.length; },
    newId: () => `op${++id}`,
  });
  return { outbox, log, storage };
}

const game = (matchId, gameNo) => ({ matchId, gameNo, result: 'A', timestamp: 'T' });

test('sends ops in order, one at a time, and commits each', async () => {
  const { outbox, log } = setup();
  outbox.enqueue('addPlayer', { name: 'Kari' });
  outbox.enqueue('startNight', { date: DATE, players: [] });
  await outbox.flush();
  assert.deepEqual(log.sent, ['addPlayer', 'startNight']);
  assert.deepEqual(log.committed, ['addPlayer', 'startNight']);
  assert.equal(log.maxConcurrent, 1);
  assert.deepEqual(outbox.pending(), []);
});

test('queue survives a reload via storage', () => {
  const storage = createStorage(memoryBackend());
  const first = setup({ storage, responses: [{ ok: false, error: 'pin' }] });
  first.outbox.enqueue('addPlayer', { name: 'Kari' });
  const second = setup({ storage });
  assert.deepEqual(second.outbox.pending().map((o) => o.action), ['addPlayer']);
});

test('a conflicting startMatch drops its dependent games but keeps unrelated ops', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('startMatch', { matchId: `${DATE}#2`, date: DATE });
  outbox.enqueue('addGame', game(`${DATE}#2`, 1));
  outbox.enqueue('addGame', game('2026-09-01#1', 4));
  await outbox.flush();
  assert.deepEqual(log.dropped, [['startMatch', 'addGame']]);
  assert.deepEqual(log.sent, ['startMatch', 'addGame']);
  assert.deepEqual(outbox.pending(), []);
});

test('a conflicting addGame drops later ops on the same match', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('addGame', game(`${DATE}#1`, 3));
  outbox.enqueue('addGame', game(`${DATE}#1`, 4));
  outbox.enqueue('deleteGame', { matchId: `${DATE}#1`, gameNo: 4 });
  await outbox.flush();
  assert.deepEqual(log.dropped, [['addGame', 'addGame', 'deleteGame']]);
});

test('a dropped startNight drops every later op for that night', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('startNight', { date: DATE, players: [] });
  outbox.enqueue('startMatch', { matchId: `${DATE}#1`, date: DATE });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.deepEqual(log.dropped, [['startNight', 'startMatch']]);
  assert.deepEqual(log.sent, ['startNight', 'addPlayer']);
});

test('wrong PIN holds the queue until resume', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'pin' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(outbox.isHeld(), true);
  assert.equal(log.pinRequests, 1);
  assert.equal(outbox.pending().length, 1);
  await outbox.resume();
  assert.equal(outbox.isHeld(), false);
  assert.deepEqual(outbox.pending(), []);
});

test('resuming synchronously inside onPinRequired keeps sending', async () => {
  const storage = createStorage(memoryBackend());
  const responses = [{ ok: false, error: 'pin' }];
  let outbox;
  outbox = createOutbox({
    storage,
    send: async () => responses.shift() ?? OK,
    onPinRequired: () => { outbox.resume(); },
    newId: () => 'op1',
  });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(outbox.isHeld(), false);
  assert.deepEqual(outbox.pending(), []);
});

test('busy and network errors keep the op and schedule a backoff retry', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'busy' }, { ok: false, error: 'network' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(log.retries.length, 1);
  assert.equal(log.retries[0].ms, 1000);
  log.retries[0].fn();
  await outbox.flush();
  assert.equal(log.retries[1].ms, 2000);
  log.retries[1].fn();
  await outbox.flush();
  assert.deepEqual(outbox.pending(), []);
});

test('retract removes a queued op but never the one in flight', async () => {
  const storage = createStorage(memoryBackend());
  let release;
  const outbox = createOutbox({
    storage,
    send: () => new Promise((resolve) => { release = () => resolve(OK); }),
    newId: (() => { let n = 0; return () => `op${++n}`; })(),
  });
  outbox.enqueue('addGame', game(`${DATE}#1`, 1));
  outbox.enqueue('addGame', game(`${DATE}#1`, 2));
  const isGame = (no) => (op) => op.action === 'addGame' && op.payload.gameNo === no;
  assert.equal(outbox.retract(isGame(1)), false);
  assert.equal(outbox.retract(isGame(2)), true);
  release();
  await outbox.flush();
  assert.deepEqual(outbox.pending(), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `docs/js/state/storage.js`**

```js
/**
 * JSON persistence over a localStorage-like backend.
 * @param {Pick<Storage, 'getItem' | 'setItem'>} [backend]
 */
export function createStorage(backend = globalThis.localStorage, prefix = 'sjineser:') {
  return {
    get(key, fallback) {
      const raw = backend.getItem(prefix + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      backend.setItem(prefix + key, JSON.stringify(value));
    },
  };
}
```

- [ ] **Step 4: Implement `docs/js/state/outbox.js`**

```js
import { parseMatchId } from '../domain/match.js';

const DROP_ERRORS = new Set(['conflict', 'invalid']);
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

/** The night and match an op belongs to. */
export function opScope(op) {
  if (op.action === 'startNight') return { night: op.payload.date, match: null };
  if (op.payload.matchId) return { night: parseMatchId(op.payload.matchId).date, match: op.payload.matchId };
  return { night: null, match: null };
}

/** True if `later` must be dropped because `dropped` was. */
export function dependsOn(later, dropped) {
  const d = opScope(dropped);
  const l = opScope(later);
  if (dropped.action === 'startNight') return l.night === d.night;
  return d.match !== null && l.match === d.match;
}

/**
 * Persistent write queue. Sends strictly one op at a time, in order.
 * - ok → onSent(op), removed
 * - conflict/invalid → dropped with all dependent ops, onDrop(op, response, dropped)
 * - pin → queue held until resume(), onPinRequired()
 * - anything else → kept, retried with backoff
 */
export function createOutbox({
  storage,
  send,
  onSent = () => {},
  onChange = () => {},
  onDrop = () => {},
  onPinRequired = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms),
  newId = () => crypto.randomUUID(),
}) {
  let queue = storage.get('outbox', []);
  let inFlightId = null;
  let held = false;
  let attempt = 0;
  let retryTimer = null;
  let running = null;

  function save() {
    storage.set('outbox', queue);
    onChange();
  }

  function remove(ops) {
    queue = queue.filter((o) => !ops.includes(o));
    save();
  }

  async function sendSafely(op) {
    try {
      return await send(op);
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  function scheduleRetry() {
    if (retryTimer !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      flush();
    }, delay);
  }

  async function drain() {
    while (queue.length > 0 && !held) {
      const op = queue[0];
      inFlightId = op.id;
      const response = await sendSafely(op);
      inFlightId = null;

      if (response.ok) {
        attempt = 0;
        onSent(op, response);
        remove([op]);
      } else if (response.error === 'pin') {
        held = true;
        onChange();
        onPinRequired();
        // onPinRequired may prompt synchronously and call resume(); if so, keep draining here,
        // because resume()'s flush() returns this already-running drain.
        if (held) return;
      } else if (DROP_ERRORS.has(response.error)) {
        attempt = 0;
        const dropped = [op, ...queue.filter((o) => o !== op && dependsOn(o, op))];
        remove(dropped);
        onDrop(op, response, dropped);
      } else {
        scheduleRetry();
        return;
      }
    }
  }

  /** Starts sending if idle; returns the active drain so callers can await it. */
  function flush() {
    running ??= drain().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    enqueue(action, payload) {
      const op = { id: newId(), action, payload };
      queue = [...queue, op];
      save();
      flush();
      return op;
    },
    /** Removes the newest queued op matching `predicate`, unless it is in flight. */
    retract(predicate) {
      const op = queue.findLast((o) => o.id !== inFlightId && predicate(o));
      if (!op) return false;
      remove([op]);
      return true;
    },
    resume() {
      held = false;
      attempt = 0;
      onChange();
      return flush();
    },
    flush,
    pending: () => queue,
    isHeld: () => held,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass. If `retract removes a queued op…` hangs, check that `flush()` returns the running drain (the test's `await outbox.flush()` must wait for the in-flight send).

- [ ] **Step 6: Commit**

```bash
git add docs/js/state tests/state
git commit -m "feat(state): persistent serial outbox with cascade drops and retry"
```

---

### Task 7: Store and actions

**Files:**
- Create: `docs/js/state/store.js`, `docs/js/state/actions.js`
- Test: `tests/state/store.test.js`, `tests/state/actions.test.js`

- [ ] **Step 1: Write failing store tests** — `tests/state/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../docs/js/state/store.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { MATCH_1, memoryBackend, nightWithMatch } from '../helpers.js';

const addGame = (gameNo, result = 'A') => ({ id: `g${gameNo}`, action: 'addGame', payload: { matchId: MATCH_1, gameNo, result, timestamp: 'T' } });

function setup({ cached = null, pending = [], getAll = async () => ({ ok: false, error: 'network' }) } = {}) {
  const storage = createStorage(memoryBackend());
  if (cached) storage.set('dataset', cached);
  const outbox = { pending: () => pending };
  const store = createStore({ storage, outbox, api: { getAll } });
  return { store, storage, pending };
}

test('view is the cached dataset plus pending ops', () => {
  const { store } = setup({ cached: nightWithMatch(['A']), pending: [addGame(2, 'D')] });
  assert.equal(store.isLoaded(), true);
  assert.deepEqual(store.get().games.map((g) => g.result), ['A', 'D']);
});

test('without cache the store starts empty and not loaded', () => {
  const { store } = setup();
  assert.equal(store.isLoaded(), false);
  assert.deepEqual(store.get().games, []);
});

test('refresh replaces server data, persists it and reapplies pending ops idempotently', async () => {
  const fresh = nightWithMatch(['A', 'B']);
  const { store, storage } = setup({ cached: nightWithMatch(), pending: [addGame(2, 'B')], getAll: async () => ({ ok: true, data: fresh }) });
  assert.equal(await store.refresh(), true);
  assert.equal(store.get().games.length, 2);
  assert.deepEqual(storage.get('dataset', null), fresh);
});

test('concurrent refreshes share one request and notify subscribers', async () => {
  let calls = 0;
  const { store } = setup({ getAll: async () => { calls += 1; return { ok: true, data: nightWithMatch() }; } });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(calls, 1);
  assert.equal(notified, 1);
});

test('a refresh with unchanged data does not notify subscribers', async () => {
  const { store } = setup({ cached: nightWithMatch(['A']), getAll: async () => ({ ok: true, data: nightWithMatch(['A']) }) });
  await store.refresh();
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  await store.refresh();
  assert.equal(notified, 0);
});

test('commit applies a sent op to server data', () => {
  const { store, storage } = setup({ cached: nightWithMatch() });
  store.commit(addGame(1));
  assert.equal(storage.get('dataset', null).games.length, 1);
});

test('ops committed while a refresh is in flight survive the stale response', async () => {
  let respond;
  const { store } = setup({ cached: nightWithMatch(), getAll: () => new Promise((r) => { respond = r; }) });
  const refreshing = store.refresh();
  store.commit(addGame(1));
  respond({ ok: true, data: nightWithMatch() });
  await refreshing;
  assert.equal(store.get().games.length, 1);
});
```

- [ ] **Step 2: Write failing actions tests** — `tests/state/actions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../../docs/js/state/actions.js';
import { createStore } from '../../docs/js/state/store.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { DATE, FOUR, MATCH_1, dataset, memoryBackend, nightWithMatch } from '../helpers.js';

/** Minimal outbox with the same retract semantics as the real one, plus manual in-flight marking. */
function fakeOutbox() {
  const inFlight = new Set();
  let n = 0;
  const box = {
    queue: [],
    onChange: () => {},
    enqueue(action, payload) {
      const op = { id: `op${++n}`, action, payload };
      box.queue.push(op);
      box.onChange();
      return op;
    },
    retract(predicate) {
      const op = box.queue.findLast((o) => !inFlight.has(o.id) && predicate(o));
      if (!op) return false;
      box.queue = box.queue.filter((o) => o !== op);
      box.onChange();
      return true;
    },
    pending: () => box.queue,
    markInFlight: (op) => inFlight.add(op.id),
  };
  return box;
}

function setup(base = dataset()) {
  const storage = createStorage(memoryBackend());
  storage.set('dataset', base);
  const outbox = fakeOutbox();
  const store = createStore({ storage, outbox, api: { getAll: async () => ({ ok: false }) } });
  outbox.onChange = () => store.recompute();
  const actions = createActions({ store, outbox, today: () => DATE, now: () => 'T' });
  return { actions, outbox, store };
}

const queued = (outbox) => outbox.queue.map((op) => `${op.action} ${op.payload.matchId ?? op.payload.name ?? op.payload.date}${op.payload.gameNo ? `/${op.payload.gameNo}` : ''}`);
const seats = { A1: 'Hans', A2: 'Per', B1: 'Frode', B2: 'Tor' };

test('addPlayer validates and enqueues the trimmed name', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.addPlayer('hans'), { ok: false, error: 'duplicate' });
  assert.deepEqual(actions.addPlayer(' Kari '), { ok: true });
  assert.deepEqual(queued(outbox), ['addPlayer Kari']);
});

test('startNight uses today and rejects fewer than four players', () => {
  const { actions, outbox } = setup();
  assert.deepEqual(actions.startNight(FOUR.slice(0, 3)), { ok: false, error: 'invalid' });
  assert.deepEqual(actions.startNight(FOUR), { ok: true });
  assert.deepEqual(queued(outbox), [`startNight ${DATE}`]);
});

test('startMatch needs a night and numbers matches within it', () => {
  assert.deepEqual(setup().actions.startMatch(seats), { ok: false, error: 'noNight' });
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
  assert.equal(store.get().matches.length, 2);
});

test('starting a new match replaces an empty unsent match', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  actions.startMatch(seats);
  assert.equal(outbox.queue.length, 1);
  assert.equal(outbox.queue[0].payload.matchId, `${DATE}#1`);
  assert.equal(outbox.queue[0].payload.A2, 'Per');
});

test('starting a new match deletes an empty synced match and reuses its number', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`, `startMatch ${MATCH_1}`]);
});

test('starting a new match keeps an abandoned match that has games', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'D']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
});

test('invalid seats are rejected without side effects', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.startMatch({ ...seats, A2: 'Hans' }), { ok: false, error: 'invalid' });
  assert.deepEqual(outbox.queue, []);
});

test('recordGame numbers games and stops when the match is complete', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'A']));
  actions.recordGame('D');
  actions.recordGame('A');
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/3`, `addGame ${MATCH_1}/4`]);
  assert.deepEqual(actions.recordGame('B'), { ok: false, error: 'noMatch' });
});

test('undo retracts an unsent game', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  actions.undo();
  assert.deepEqual(outbox.queue, []);
  assert.equal(store.get().games.length, 0);
});

test('undo of an in-flight game enqueues deleteGame', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  outbox.markInFlight(outbox.queue[0]);
  actions.undo();
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/1`, `deleteGame ${MATCH_1}/1`]);
  assert.equal(store.get().games.length, 0);
});

test('undo works on a just-completed match', () => {
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteGame ${MATCH_1}/3`]);
  assert.equal(store.get().games.length, 2);
});

test('undo with no games removes the match', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`]);
  assert.deepEqual(setup().actions.undo(), { ok: false, error: 'nothingToUndo' });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `docs/js/state/store.js`**

```js
import { applyOp, emptyDataset } from '../domain/dataset.js';

/**
 * Holds the last known server dataset (persisted) and exposes
 * view = server dataset + pending outbox ops, applied idempotently.
 * @param {{ storage: object, outbox: { pending(): object[] }, api: { getAll(): Promise<object> } }} deps
 */
export function createStore({ storage, outbox, api }) {
  const cached = storage.get('dataset', null);
  const listeners = new Set();
  const applyAll = (dataset, ops) => ops.reduce((ds, op) => applyOp(ds, op).dataset, dataset);

  let base = cached ?? emptyDataset();
  let loaded = cached !== null;
  let view = applyAll(base, outbox.pending());
  let fetching = null;
  let sentDuringFetch = [];

  function recompute() {
    view = applyAll(base, outbox.pending());
    listeners.forEach((listener) => listener(view));
  }

  function setBase(dataset) {
    base = dataset;
    storage.set('dataset', base);
  }

  async function load() {
    sentDuringFetch = [];
    const response = await api.getAll();
    if (!response.ok) return false;
    // Ops the server accepted after this request started may be missing from the response.
    const fresh = applyAll(response.data, sentDuringFetch);
    const changed = !loaded || JSON.stringify(fresh) !== JSON.stringify(base);
    setBase(fresh);
    loaded = true;
    // Polling must not rebuild views (and swallow taps) when nothing changed.
    if (changed) recompute();
    return true;
  }

  return {
    get: () => view,
    isLoaded: () => loaded,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recompute,
    /** Fetches fresh server data. Concurrent calls share one request. Resolves to success. */
    refresh() {
      fetching ??= load().finally(() => {
        fetching = null;
      });
      return fetching;
    },
    /** Applies an op the server accepted, so the view does not flicker before the next refresh. */
    commit(op) {
      setBase(applyOp(base, op).dataset);
      if (fetching) sentDuringFetch.push(op);
      recompute();
    },
  };
}
```

- [ ] **Step 5: Implement `docs/js/state/actions.js`**

```js
import { applyOp } from '../domain/dataset.js';
import { toISODate } from '../domain/dates.js';
import { validateNewName } from '../domain/players.js';
import {
  currentMatch, currentNight, gamesOf, latestMatch, nextGameNo, nextMatchId, validSeats,
} from '../domain/match.js';

/**
 * User intents. Each validates against the current view, enqueues ops and
 * returns { ok: true } or { ok: false, error } where error is a key of t.errors.
 */
export function createActions({ store, outbox, today = () => toISODate(new Date()), now = () => new Date().toISOString() }) {
  const view = () => store.get();

  function submit(action, payload) {
    const { outcome } = applyOp(view(), { action, payload });
    if (outcome === 'invalid' || outcome === 'conflict') return { ok: false, error: outcome };
    if (outcome === 'applied') outbox.enqueue(action, payload);
    return { ok: true };
  }

  /** Takes back an earlier op: drop it if still queued, otherwise enqueue its inverse. */
  function revert(isOriginal, inverseAction, inversePayload) {
    if (!outbox.retract(isOriginal)) outbox.enqueue(inverseAction, inversePayload);
  }

  const removeGame = (matchId, gameNo) => revert(
    (op) => op.action === 'addGame' && op.payload.matchId === matchId && op.payload.gameNo === gameNo,
    'deleteGame', { matchId, gameNo },
  );

  const removeMatch = (matchId) => revert(
    (op) => op.action === 'startMatch' && op.payload.matchId === matchId,
    'deleteMatch', { matchId },
  );

  return {
    addPlayer(name) {
      const error = validateNewName(name, view().players);
      return error ? { ok: false, error } : submit('addPlayer', { name: name.trim() });
    },

    startNight(players) {
      return submit('startNight', { date: today(), players });
    },

    /** Starts the next match. An empty current match is abandoned by removing it. */
    startMatch({ A1, A2, B1, B2 }) {
      const night = currentNight(view());
      if (!night) return { ok: false, error: 'noNight' };
      if (!validSeats({ A1, A2, B1, B2 })) return { ok: false, error: 'invalid' };
      const open = currentMatch(view());
      if (open && gamesOf(view(), open.matchId).length === 0) removeMatch(open.matchId);
      return submit('startMatch', { matchId: nextMatchId(view(), night.date), date: night.date, A1, A2, B1, B2 });
    },

    recordGame(result) {
      const match = currentMatch(view());
      if (!match) return { ok: false, error: 'noMatch' };
      const gameNo = nextGameNo(gamesOf(view(), match.matchId));
      return submit('addGame', { matchId: match.matchId, gameNo, result, timestamp: now() });
    },

    /** Removes the last game of the latest match (even if complete), or the match itself if it has none. */
    undo() {
      const match = latestMatch(view());
      if (!match) return { ok: false, error: 'nothingToUndo' };
      const last = gamesOf(view(), match.matchId).at(-1);
      if (last) removeGame(match.matchId, last.gameNo);
      else removeMatch(match.matchId);
      return { ok: true };
    },
  };
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add docs/js/state tests/state
git commit -m "feat(state): store with optimistic view and user actions with undo"
```

---

### Task 8: Apps Script backend

Steps marked **(user)** need the user's Google login; ask the user to run them (they can type `! <command>` in Claude Code) and wait for confirmation.

**Files:**
- Create: `apps-script/Code.js`, `apps-script/appsscript.json`, `apps-script/.clasp.json` (generated)

- [ ] **Step 1 (user): Enable the Apps Script API and install clasp**

1. Open https://script.google.com/home/usersettings and turn **Google Apps Script API** on.
2. Run: `npm install -g @google/clasp && clasp login` (opens a browser).

Expected: `clasp login` ends with "You are logged in".

- [ ] **Step 2 (user): Create the standalone script project**

```bash
mkdir -p apps-script && cd apps-script && clasp create --type standalone --title "Sjineser API"
```

Expected: creates `apps-script/.clasp.json` with a `scriptId` and an `appsscript.json`. (clasp 3 also accepts `clasp create-script`.)

- [ ] **Step 3: Overwrite `apps-script/appsscript.json`**

```json
{
  "timeZone": "Europe/Oslo",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "dependencies": {},
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 4: Write `apps-script/Code.js`**

The validation rules mirror `docs/js/domain/dataset.js`; keep them in sync.

```js
/**
 * Sjineser backend: a thin, locked read/write layer over the sheet.
 * Script Properties: SHEET_ID (target spreadsheet), PIN (shared write PIN).
 * Every response is a JSON envelope: { ok: true, result, data } | { ok: false, error, message }.
 */

const TABS = {
  Players: ['name', 'active'],
  Nights: ['date', 'players'],
  Matches: ['matchId', 'date', 'A1', 'A2', 'B1', 'B2'],
  Games: ['matchId', 'gameNo', 'result', 'timestamp'],
};
const TEXT_COLUMNS = { Nights: ['A'], Matches: ['A', 'B'], Games: ['A', 'D'] };
const SEATS = ['A1', 'A2', 'B1', 'B2'];
const RESULTS = ['A', 'B', 'D'];
const MATCH_ID = /^\d{4}-\d{2}-\d{2}#\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCK_TIMEOUT_MS = 10000;
const STATUS_FORMULA =
  '=ARRAYFORMULA(IF(ROW(A:A)=1,"status",IF(A:A="",,' +
  'LET(a,COUNTIFS(Games!A:A,A:A,Games!C:C,"A"),b,COUNTIFS(Games!A:A,A:A,Games!C:C,"B"),' +
  'IF(a>=3,"A vant ",IF(b>=3,"B vant ","ikke ferdig "))&a&"–"&b))))';

// ---------- HTTP entry points ----------

function doGet() {
  return json(done('noop', readAll()));
}

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return json(fail('invalid', 'Malformed JSON'));
  }
  const pin = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!pin || request.pin !== pin) return json(fail('pin', 'Wrong PIN'));
  const handler = HANDLERS[request.action];
  if (!handler) return json(fail('invalid', 'Unknown action'));

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return json(fail('busy', 'Busy, try again'));
  try {
    return json(handler(request.payload || {}));
  } finally {
    lock.releaseLock();
  }
}

// ---------- Write handlers (mirror docs/js/domain/dataset.js) ----------

const HANDLERS = {
  addPlayer({ name }) {
    const clean = String(name || '').trim();
    if (!clean || clean.includes(',')) return fail('invalid', 'Invalid name');
    const existing = readTab('Players').find((r) => r.value.name.toLowerCase() === clean.toLowerCase());
    if (existing) return done('noop', { name: existing.value.name });
    append('Players', [clean, true]);
    return done('applied', { name: clean });
  },

  startNight({ date, players }) {
    const list = (players || []).map((p) => String(p).trim());
    const existing = readTab('Nights').find((r) => r.value.date === date);
    if (existing) {
      return sameMembers(existing.value.players, list) ? done('noop') : fail('conflict', 'Night exists with another roster');
    }
    if (!ISO_DATE.test(date) || list.length < 4 || new Set(list).size !== list.length) {
      return fail('invalid', 'Invalid night');
    }
    append('Nights', [date, list.join(', ')]);
    return done('applied');
  },

  startMatch(payload) {
    const seats = SEATS.map((seat) => String(payload[seat] || '').trim());
    const existing = readTab('Matches').find((r) => r.value.matchId === payload.matchId);
    if (existing) {
      const same = SEATS.every((seat, i) => existing.value[seat] === seats[i]);
      return same ? done('noop') : fail('conflict', 'Match exists with other players');
    }
    if (!MATCH_ID.test(payload.matchId) || seats.some((s) => !s) || new Set(seats).size !== 4) {
      return fail('invalid', 'Invalid match');
    }
    append('Matches', [payload.matchId, payload.date].concat(seats));
    return done('applied');
  },

  addGame({ matchId, gameNo, result, timestamp }) {
    const number = Number(gameNo);
    if (!RESULTS.includes(result) || !(number >= 1)) return fail('invalid', 'Invalid game');
    if (!readTab('Matches').some((r) => r.value.matchId === matchId)) return fail('invalid', 'Unknown match');
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === number);
    if (existing) {
      return existing.value.result === result ? done('noop') : fail('conflict', 'Game exists with another result');
    }
    append('Games', [matchId, number, result, String(timestamp || new Date().toISOString())]);
    return done('applied');
  },

  deleteGame({ matchId, gameNo }) {
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === Number(gameNo));
    if (!existing) return done('noop');
    tab('Games').deleteRow(existing.row);
    return done('applied');
  },

  deleteMatch({ matchId }) {
    const existing = readTab('Matches').find((r) => r.value.matchId === matchId);
    if (!existing) return done('noop');
    if (readTab('Games').some((r) => r.value.matchId === matchId)) return fail('invalid', 'Match has games');
    tab('Matches').deleteRow(existing.row);
    return done('applied');
  },
};

// ---------- Sheet access ----------

const PARSERS = {
  Players: ([name, active]) => ({ name: String(name).trim(), active: active === true || String(active).toUpperCase() === 'TRUE' }),
  Nights: ([date, players]) => ({ date: isoDate(date), players: String(players).split(',').map((p) => p.trim()).filter(Boolean) }),
  Matches: ([matchId, date, A1, A2, B1, B2]) => ({
    matchId: String(matchId).trim(), date: isoDate(date),
    A1: String(A1).trim(), A2: String(A2).trim(), B1: String(B1).trim(), B2: String(B2).trim(),
  }),
  Games: ([matchId, gameNo, result, timestamp]) => ({
    matchId: String(matchId).trim(), gameNo: Number(gameNo),
    result: String(result).trim().toUpperCase(), timestamp: String(timestamp),
  }),
};

let spreadsheetCache = null;
function spreadsheet() {
  spreadsheetCache = spreadsheetCache ||
    SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  return spreadsheetCache;
}

function tab(name) {
  return spreadsheet().getSheetByName(name);
}

/** Number of data rows, based on the last non-empty cell in column A (ignores formula columns). */
function dataRowCount(sheet) {
  const rows = sheet.getMaxRows() - 1;
  if (rows < 1) return 0;
  const values = sheet.getRange(2, 1, rows, 1).getValues();
  let last = values.length;
  while (last > 0 && values[last - 1][0] === '') last -= 1;
  return last;
}

/** Rows of a tab as { row, value }, skipping rows with an empty first column. */
function readTab(name) {
  const sheet = tab(name);
  const count = dataRowCount(sheet);
  if (count === 0) return [];
  return sheet.getRange(2, 1, count, TABS[name].length).getValues()
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter((r) => r.cells[0] !== '')
    .map((r) => ({ row: r.row, value: PARSERS[name](r.cells) }));
}

function readAll() {
  const values = (name) => readTab(name).map((r) => r.value);
  return { players: values('Players'), nights: values('Nights'), matches: values('Matches'), games: values('Games') };
}

function append(name, cells) {
  const sheet = tab(name);
  const row = dataRowCount(sheet) + 2;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
}

// ---------- Setup (run once per sheet from the editor) ----------

function setup() {
  const ss = spreadsheet();
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    (TEXT_COLUMNS[name] || []).forEach((col) => sheet.getRange(col + ':' + col).setNumberFormat('@'));
  });
  const players = ss.getSheetByName('Players');
  players.getRange('B2:B').insertCheckboxes();
  const matches = ss.getSheetByName('Matches');
  matches.getRange('G1').setFormula(STATUS_FORMULA);
  matches.getRange('C2:F').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(players.getRange('A2:A'), true).setAllowInvalid(false).build(),
  );
}

// ---------- Helpers ----------

function isoDate(value) {
  return value instanceof Date
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(value).trim();
}

function sameMembers(a, b) {
  return a.length === b.length && a.every((name) => b.includes(name));
}

function done(result, data) {
  return { ok: true, result, data };
}

function fail(error, message) {
  return { ok: false, error, message };
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 5 (user): Push, configure and run setup**

1. `cd apps-script && clasp push` — expected: "Pushed 2 files."
2. `clasp open-script` (clasp 2: `clasp open`) → in the editor: **Project Settings → Script properties** add
   - `SHEET_ID` = `170on0ejd0VDtE9G3fg8fNirwNvpRsbzm6odd-EuA7Wk`
   - `PIN` = a PIN of your choice (do not commit it anywhere)
3. In the editor select function `setup` → **Run** → accept the authorization prompt ("unverified app" → Advanced → continue).

Expected: the sheet now has tabs Players, Nights, Matches (with `status` in G1), Games.

- [ ] **Step 6 (user): Deploy as web app**

```bash
cd apps-script && clasp create-deployment --description "phase 1"
```

(clasp 2: `clasp deploy --description "phase 1"`.) Note the deployment ID. The URL is `https://script.google.com/macros/s/<deploymentId>/exec`. To update the same URL later: `clasp push && clasp create-deployment -i <deploymentId>`.

- [ ] **Step 7: Verify the API with curl**

```bash
URL='https://script.google.com/macros/s/<deploymentId>/exec'
curl -sL "$URL"
curl -sL -d '{"action":"addPlayer","payload":{"name":"Test"},"pin":"wrong"}' "$URL"
curl -sL -d '{"action":"addPlayer","payload":{"name":"Test"},"pin":"<PIN>"}' "$URL"
curl -sL -d '{"action":"addPlayer","payload":{"name":"test"},"pin":"<PIN>"}' "$URL"
```

Expected, in order:
- `{"ok":true,"result":"noop","data":{"players":[],"nights":[],"matches":[],"games":[]}}`
- `{"ok":false,"error":"pin",...}`
- `{"ok":true,"result":"applied","data":{"name":"Test"}}`
- `{"ok":true,"result":"noop","data":{"name":"Test"}}`

Then delete the `Test` row in the Players tab by hand. Also confirm the `status` formula did not fill column G of empty rows (G2 and below are blank).

- [ ] **Step 8: Commit**

```bash
git add apps-script/Code.js apps-script/appsscript.json apps-script/.clasp.json
git commit -m "feat(backend): Apps Script API with setup, lock and idempotent writes"
```

---

### Task 9: App shell — HTML, CSS, text, router, composition root

No unit tests for DOM code; verified in the browser at the end of the task.

**Files:**
- Create: `docs/index.html`, `docs/CNAME`, `docs/css/tokens.css`, `docs/css/base.css`, `docs/css/layout.css`, `docs/css/components.css`, `docs/js/config.js`, `docs/js/i18n/nb.js`, `docs/js/router.js`, `docs/js/main.js`, `docs/js/views/components/dom.js`, `docs/js/views/components/toast.js`, `docs/js/views/components/pin-prompt.js`, `docs/js/views/shell.js`, `docs/js/views/sync-messages.js`, `docs/js/views/routes.js`, `docs/js/views/stats/stats.js`
- Create (placeholders replaced in Tasks 10–11): `docs/js/views/play/home.js`, `docs/js/views/play/start-night.js`, `docs/js/views/play/new-match.js`, `docs/js/views/play/match.js`

- [ ] **Step 1: `docs/index.html`**

```html
<!doctype html>
<html lang="nb">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark light">
  <meta name="theme-color" content="#101317">
  <meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)">
  <title>Sjineser</title>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/views/play.css">
  <script type="module" src="js/main.js"></script>
</head>
<body>
  <header class="app-header">
    <span class="app-title" data-text="appName"></span>
    <button id="sync-badge" class="badge" type="button" hidden></button>
  </header>
  <main id="view" class="app-main"></main>
  <nav class="tabbar">
    <a href="#/play" data-tab="play"></a>
    <a href="#/stats" data-tab="stats"></a>
  </nav>
  <div id="toasts" class="toasts" aria-live="polite"></div>
</body>
</html>
```

- [ ] **Step 2: `docs/CNAME`**

```
sjineser.rodland.no
```

- [ ] **Step 3: `docs/css/tokens.css`** (dark is the default; light only when the device asks for it)

```css
:root {
  color-scheme: dark;

  --bg: #101317;
  --surface: #181c22;
  --surface-raised: #20262e;
  --border: #2b323c;
  --text: #e9edf1;
  --text-muted: #8f9aa6;

  --accent: #3fbfa8;
  --accent-text: #06201b;
  --team-a: #5c9df5;
  --team-b: #f2a24a;
  --draw: #8f9aa6;
  --warning: #f2c94c;
  --danger: #ef6b6b;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --radius-sm: 8px;
  --radius: 14px;
  --radius-pill: 999px;

  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-score: 4.5rem;

  --tap: 48px;
  --header-height: 52px;
  --tabbar-height: 60px;
  --content-width: 640px;
}

@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #f4f5f7;
    --surface: #ffffff;
    --surface-raised: #eef0f3;
    --border: #dde1e6;
    --text: #15191e;
    --text-muted: #5f6b77;
    --accent: #138a76;
    --accent-text: #ffffff;
    --team-a: #2f74d6;
    --team-b: #d9801c;
    --draw: #6b7682;
  }
}
```

- [ ] **Step 4: `docs/css/base.css`**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: var(--text-base);
  line-height: 1.45;
  -webkit-tap-highlight-color: transparent;
}

h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 650;
}

p,
ul,
ol {
  margin: 0;
}

button,
input {
  font: inherit;
  color: inherit;
}

button {
  touch-action: manipulation;
  cursor: pointer;
}

a {
  color: inherit;
}
```

- [ ] **Step 5: `docs/css/layout.css`**

```css
.app-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(var(--header-height) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) var(--space-4) 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.app-title {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.app-main {
  max-width: var(--content-width);
  margin: 0 auto;
  padding:
    calc(var(--header-height) + env(safe-area-inset-top) + var(--space-5))
    var(--space-4)
    calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-5));
}

.tabbar {
  position: fixed;
  inset: auto 0 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.tabbar a {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 600;
}

.tabbar a[aria-current="page"] {
  color: var(--accent);
}

.stack {
  display: grid;
  gap: var(--space-4);
}
```

- [ ] **Step 6: `docs/css/components.css`**

```css
.btn {
  min-height: var(--tap);
  padding: 0 var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  font-weight: 600;
}

.btn-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-text);
}

.btn-ghost {
  background: transparent;
  color: var(--text-muted);
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.card {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.muted {
  color: var(--text-muted);
}

.center {
  text-align: center;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
}

.chip[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-text);
}

.inline-form {
  display: flex;
  gap: var(--space-2);
}

.field {
  flex: 1;
  min-width: 0;
  min-height: var(--tap);
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--text-base); /* 16px+ stops iOS zooming on focus */
}

.badge {
  padding: var(--space-1) var(--space-3);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.badge-warning {
  background: var(--warning);
  color: #1d1600;
}

.toasts {
  position: fixed;
  inset: auto var(--space-4) calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-3));
  z-index: 20;
  display: grid;
  gap: var(--space-2);
  pointer-events: none;
}

.toast {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--text);
  color: var(--bg);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.3);
}
```

- [ ] **Step 7: `docs/js/config.js`**

```js
/** Apps Script web app URL (public; the PIN is the secret). Empty → app runs offline-only. */
export const API_URL = '';

/** How often an open match screen checks for results entered on other phones. */
export const POLL_MS = 5000;
```

After Task 8 Step 6, set `API_URL` to the deployment URL.

- [ ] **Step 8: `docs/js/i18n/nb.js`**

```js
/** All user-visible Norwegian text. */
export const t = {
  appName: 'Sjineser',
  tabs: { play: 'Spill', stats: 'Statistikk' },
  loading: 'Laster …',
  offline: 'Får ikke kontakt med serveren. Viser lagrede data.',

  noNights: 'Ingen kvelder ennå.',
  nightOf: (date) => `Kveld ${date}`,
  continueNight: 'Fortsett kvelden',
  newNight: 'Ny kveld',

  choosePlayers: 'Hvem spiller i kveld?',
  newPlayerPlaceholder: 'Ny spiller',
  addPlayer: 'Legg til',
  startNight: 'Start kvelden',
  minPlayers: (n) => `Velg minst 4 spillere (${n} valgt)`,

  newMatch: 'Ny kamp',
  pickTeams: 'Trykk på en spiller for å flytte: benk → Lag A → Lag B',
  sides: { bench: 'Benk', A: 'Lag A', B: 'Lag B' },
  startMatch: 'Start kampen',
  abandonConfirm: (a, b) => `Kampen står ${a}–${b}. Avbryte den og starte en ny?`,

  matchTitle: (n) => `Kamp ${n}`,
  noMatch: 'Ingen kamp i gang.',
  results: { A: 'Lag A vant', D: 'Uavgjort', B: 'Lag B vant' },
  resultShort: { A: 'A', D: 'U', B: 'B' },
  draws: (n) => `Uavgjort: ${n}`,
  undo: 'Angre',
  and: ' og ',
  matchWon: (names, wins, losses) => `${names} vinner ${wins}–${losses}!`,
  nextMatch: 'Neste kamp',

  unsynced: (n) => `${n} ikke lagret`,
  pinNeeded: 'PIN trengs',
  enterPin: 'Skriv inn PIN for å lagre resultater',
  matchTaken: (n) => `Noen andre startet kamp ${n}. Henter siste data.`,
  rejected: { conflict: 'En endring kolliderte med data fra en annen telefon. Henter siste data.', invalid: 'En endring ble avvist. Henter siste data.' },

  errors: {
    empty: 'Skriv inn et navn',
    comma: 'Navn kan ikke inneholde komma',
    duplicate: 'Spilleren finnes allerede',
    invalid: 'Ugyldig valg',
    conflict: 'Kolliderer med eksisterende data',
    noNight: 'Start en kveld først',
    noMatch: 'Ingen kamp i gang',
    nothingToUndo: 'Ingenting å angre',
  },

  statsComingSoon: 'Statistikk kommer snart.',
};

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

/** "2026-10-14" → "14. okt." */
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}
```

- [ ] **Step 9: `docs/js/views/components/dom.js`**

```js
/**
 * Creates an element. Props named on<event> become listeners; null/undefined/false props are skipped;
 * true becomes an empty attribute. Children may be nested arrays; null/false children are skipped.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}
```

- [ ] **Step 10: `docs/js/views/components/toast.js`**

```js
import { h } from './dom.js';

const TOAST_MS = 3500;

/** @param {string} message */
export function showToast(message) {
  const toast = h('div', { class: 'toast', role: 'status' }, message);
  document.getElementById('toasts').append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}
```

- [ ] **Step 11: `docs/js/views/components/pin-prompt.js`**

```js
import { t } from '../../i18n/nb.js';

/** Asks for the shared PIN, stores it and resumes the held outbox. */
export function askForPin({ storage, outbox }) {
  const pin = window.prompt(t.enterPin);
  if (!pin?.trim()) return;
  storage.set('pin', pin.trim());
  outbox.resume();
}
```

- [ ] **Step 12: `docs/js/views/shell.js`**

```js
import { t } from '../i18n/nb.js';
import { askForPin } from './components/pin-prompt.js';

/** Fills static shell text and keeps the sync badge current. */
export function mountShell({ store, outbox, storage }) {
  document.querySelector('[data-text="appName"]').textContent = t.appName;
  document.querySelectorAll('[data-tab]').forEach((link) => {
    link.textContent = t.tabs[link.dataset.tab];
  });

  const badge = document.getElementById('sync-badge');
  badge.addEventListener('click', () => {
    if (outbox.isHeld()) askForPin({ storage, outbox });
  });

  function update() {
    const count = outbox.pending().length;
    badge.hidden = count === 0;
    badge.textContent = outbox.isHeld() ? t.pinNeeded : t.unsynced(count);
    badge.classList.toggle('badge-warning', outbox.isHeld());
  }
  store.subscribe(update);
  update();
}

/** @param {string} path */
export function markActiveTab(path) {
  const active = path.startsWith('/stats') ? 'stats' : 'play';
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
```

- [ ] **Step 13: `docs/js/views/sync-messages.js`**

```js
import { t } from '../i18n/nb.js';
import { parseMatchId } from '../domain/match.js';

/** Text shown when the server rejected a queued op. */
export function describeDrop(op, response) {
  if (op.action === 'startMatch' && response.error === 'conflict') {
    return t.matchTaken(parseMatchId(op.payload.matchId).number);
  }
  return t.rejected[response.error] ?? t.rejected.invalid;
}
```

- [ ] **Step 14: `docs/js/router.js`**

```js
/**
 * Hash router. A view is mount(root, ctx) → { update?(), destroy?() }.
 * update() is called whenever the store changes.
 */
export function createRouter({ root, routes, ctx, onRoute = () => {} }) {
  let current = null;
  const currentPath = () => location.hash.slice(1) || '/';

  function render() {
    current?.destroy?.();
    const path = currentPath();
    const mount = routes[path] ?? routes['/'];
    root.replaceChildren();
    current = mount(root, ctx);
    onRoute(path);
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      ctx.store.subscribe(() => current?.update?.());
      render();
    },
  };
}

/** @param {string} path e.g. '/play/match' */
export function navigate(path) {
  location.hash = path;
}
```

- [ ] **Step 15: Placeholder views and `docs/js/views/stats/stats.js`**

`docs/js/views/stats/stats.js`:

```js
import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';

export function mountStats(root) {
  root.replaceChildren(h('p', { class: 'muted' }, t.statsComingSoon));
  return {};
}
```

Create `docs/js/views/play/home.js`, `start-night.js`, `new-match.js`, `match.js`, each temporarily exporting its mount function with the same body as `mountStats` (names: `mountHome`, `mountStartNight`, `mountNewMatch`, `mountMatch`). Tasks 10–11 replace them.

- [ ] **Step 16: `docs/js/views/routes.js`**

```js
import { mountHome } from './play/home.js';
import { mountStartNight } from './play/start-night.js';
import { mountNewMatch } from './play/new-match.js';
import { mountMatch } from './play/match.js';
import { mountStats } from './stats/stats.js';

export const routes = {
  '/': mountHome,
  '/play': mountHome,
  '/play/night': mountStartNight,
  '/play/new-match': mountNewMatch,
  '/play/match': mountMatch,
  '/stats': mountStats,
};
```

- [ ] **Step 17: `docs/js/main.js`**

```js
import { API_URL } from './config.js';
import { createApiClient } from './api/client.js';
import { createStorage } from './state/storage.js';
import { createOutbox } from './state/outbox.js';
import { createStore } from './state/store.js';
import { createActions } from './state/actions.js';
import { createRouter, navigate } from './router.js';
import { routes } from './views/routes.js';
import { markActiveTab, mountShell } from './views/shell.js';
import { showToast } from './views/components/toast.js';
import { askForPin } from './views/components/pin-prompt.js';
import { describeDrop } from './views/sync-messages.js';
import { t } from './i18n/nb.js';

const storage = createStorage();
const api = createApiClient({ url: API_URL });

let store;
const outbox = createOutbox({
  storage,
  send: (op) => api.post(op.action, op.payload, storage.get('pin', '')),
  onSent: (op) => store.commit(op),
  onChange: () => store?.recompute(),
  onDrop: (op, response) => {
    showToast(describeDrop(op, response));
    store.refresh();
  },
  onPinRequired: () => askForPin({ storage, outbox }),
});
store = createStore({ storage, outbox, api });
const actions = createActions({ store, outbox });

mountShell({ store, outbox, storage });
createRouter({
  root: document.getElementById('view'),
  routes,
  ctx: { store, actions, navigate },
  onRoute: markActiveTab,
}).start();

store.refresh().then((ok) => {
  if (!ok) showToast(t.offline);
});
outbox.flush();

function resync() {
  outbox.flush();
  store.refresh();
}
window.addEventListener('online', resync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resync();
});
```

- [ ] **Step 18: Create an empty `docs/css/views/play.css`** (filled in Task 11) so the stylesheet link resolves.

- [ ] **Step 19: Verify in the browser**

Run: `npm run serve` and open http://localhost:8000.
Expected: header "Sjineser", tab bar "Spill" / "Statistikk" with the active tab highlighted, placeholder text, dark theme (light if the OS is in light mode), no console errors. With `API_URL` empty a toast says "Får ikke kontakt med serveren…".

- [ ] **Step 20: Run tests and commit**

Run: `npm test` — expected: all pass.

```bash
git add docs
git commit -m "feat(app): shell, design tokens, router and composition root"
```

---

### Task 10: Home and start-night screens

**Files:**
- Modify (replace placeholder): `docs/js/views/play/home.js`, `docs/js/views/play/start-night.js`

- [ ] **Step 1: `docs/js/views/play/home.js`**

```js
import { h } from '../components/dom.js';
import { formatDate, t } from '../../i18n/nb.js';
import { currentNight } from '../../domain/match.js';
import { toISODate } from '../../domain/dates.js';

export function mountHome(root, { store, navigate }) {
  const nightCard = (night) =>
    h('div', { class: 'card stack' },
      h('p', { class: 'muted' }, t.nightOf(formatDate(night.date))),
      h('p', {}, night.players.join(', ')),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/play/match') }, t.continueNight));

  function update() {
    const night = currentNight(store.get());
    const startedToday = night?.date === toISODate(new Date());
    root.replaceChildren(
      h('section', { class: 'stack' },
        night ? nightCard(night) : h('p', { class: 'muted' }, store.isLoaded() ? t.noNights : t.loading),
        h('button', { class: 'btn', disabled: startedToday, onclick: () => navigate('/play/night') }, t.newNight)),
    );
  }

  update();
  return { update };
}
```

- [ ] **Step 2: `docs/js/views/play/start-night.js`**

The form is built once so typing is not interrupted when the store changes; `update()` only refreshes the chips and the start button.

```js
import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { activePlayers, byName } from '../../domain/players.js';

const MIN_PLAYERS = 4;

export function mountStartNight(root, { store, actions, navigate }) {
  const selected = new Set();
  const chips = h('div', { class: 'chips' });
  const input = h('input', { class: 'field', type: 'text', placeholder: t.newPlayerPlaceholder, autocomplete: 'off', enterkeyhint: 'done' });
  const startButton = h('button', { class: 'btn btn-primary', onclick: start });

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
    startButton.textContent = enough ? t.startNight : t.minPlayers(selected.size);
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
```

- [ ] **Step 3: Verify in the browser** (`npm run serve`, API_URL may still be empty)

1. Home shows "Ingen kvelder ennå." (or "Laster …") and "Ny kveld".
2. "Ny kveld" → add players Hans, Frode, Tor, Per via the field (each appears selected); try adding "hans" → toast "Spilleren finnes allerede"; try "A, B" → comma toast.
3. Start button reads "Velg minst 4 spillere (n valgt)" until 4 are selected, then "Start kvelden".
4. Start → navigates to `#/play/new-match` (placeholder). Back on home: a card "Kveld 14. okt." with the four names; "Ny kveld" is disabled.
5. Header badge shows "n ikke lagret" while the API is unreachable.

- [ ] **Step 4: Commit**

```bash
git add docs/js/views/play
git commit -m "feat(play): home and start-night screens"
```

---

### Task 11: New-match and match screens

**Files:**
- Modify (replace placeholder): `docs/js/views/play/new-match.js`, `docs/js/views/play/match.js`
- Modify: `docs/css/views/play.css`

- [ ] **Step 1: `docs/js/views/play/new-match.js`**

```js
import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { byName } from '../../domain/players.js';
import { currentMatch, currentNight, gamesOf, score } from '../../domain/match.js';

const TEAM_SIZE = 2;
const NEXT_SIDE = { bench: 'A', A: 'B', B: 'bench' };

export function mountNewMatch(root, { store, actions, navigate }) {
  /** @type {Map<string, 'A' | 'B'>} players not in the map are on the bench */
  const sides = new Map();
  const count = (side) => [...sides.values()].filter((s) => s === side).length;
  const team = (side) => [...sides].filter(([, s]) => s === side).map(([name]) => name).sort(byName);

  /** Moves a player bench → A → B → bench, skipping full teams. */
  function cycle(name) {
    let side = NEXT_SIDE[sides.get(name) ?? 'bench'];
    if (side === 'A' && count('A') === TEAM_SIZE) side = 'B';
    if (side === 'B' && count('B') === TEAM_SIZE) side = 'bench';
    if (side === 'bench') sides.delete(name);
    else sides.set(name, side);
    update();
  }

  function confirmAbandon() {
    const open = currentMatch(store.get());
    const games = open ? gamesOf(store.get(), open.matchId) : [];
    if (games.length === 0) return true;
    const { A, B } = score(games);
    return window.confirm(t.abandonConfirm(A, B));
  }

  function start() {
    if (!confirmAbandon()) return;
    const [A1, A2] = team('A');
    const [B1, B2] = team('B');
    const result = actions.startMatch({ A1, A2, B1, B2 });
    if (!result.ok) return showToast(t.errors[result.error]);
    navigate('/play/match');
  }

  function update() {
    const night = currentNight(store.get());
    if (!night) {
      root.replaceChildren(h('p', { class: 'muted' }, t.errors.noNight));
      return;
    }
    const ready = count('A') === TEAM_SIZE && count('B') === TEAM_SIZE;
    root.replaceChildren(
      h('section', { class: 'stack' },
        h('h1', {}, t.newMatch),
        h('p', { class: 'muted' }, t.pickTeams),
        h('ul', { class: 'assign-list' }, night.players.map((name) => {
          const side = sides.get(name) ?? 'bench';
          return h('li', {},
            h('button', { class: 'assign-row', type: 'button', 'data-side': side, onclick: () => cycle(name) },
              h('span', {}, name),
              h('span', { class: 'assign-side' }, t.sides[side])));
        })),
        h('button', { class: 'btn btn-primary', disabled: !ready, onclick: start }, t.startMatch)),
    );
  }

  update();
  return { update };
}
```

- [ ] **Step 2: `docs/js/views/play/match.js`**

```js
import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { POLL_MS } from '../../config.js';
import { currentNight, gamesOf, latestMatch, parseMatchId, score, teamOf, winnerOf } from '../../domain/match.js';

/** Ignores a second tap this soon after the first, so a double tap does not record two games. */
const TAP_COOLDOWN_MS = 800;
const RESULT_ORDER = ['A', 'D', 'B'];

export function mountMatch(root, { store, actions, navigate }) {
  let lastTap = 0;
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') store.refresh();
  }, POLL_MS);

  function record(result) {
    const now = Date.now();
    if (now - lastTap < TAP_COOLDOWN_MS) return;
    lastTap = now;
    const outcome = actions.recordGame(result);
    if (!outcome.ok) showToast(t.errors[outcome.error]);
  }

  function undo() {
    const outcome = actions.undo();
    if (!outcome.ok) showToast(t.errors[outcome.error]);
  }

  const teamPanel = (match, side, wins, winner) =>
    h('div', { class: 'team-panel', 'data-side': side, 'data-winner': String(winner === side) },
      h('span', { class: 'team-names' }, teamOf(match, side).join(t.and)),
      h('span', { class: 'score' }, String(wins)));

  const resultButtons = () =>
    h('div', { class: 'result-buttons' }, RESULT_ORDER.map((result) =>
      h('button', { class: 'btn btn-result', type: 'button', 'data-side': result, onclick: () => record(result) }, t.results[result])));

  const winnerBanner = (match, winner, totals) =>
    h('div', { class: 'winner-banner', 'data-side': winner },
      h('p', {}, t.matchWon(teamOf(match, winner).join(t.and), totals[winner], totals[winner === 'A' ? 'B' : 'A'])),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/play/new-match') }, t.nextMatch));

  const noMatch = () =>
    h('section', { class: 'stack' },
      h('p', { class: 'muted' }, t.noMatch),
      h('button', { class: 'btn btn-primary', onclick: () => navigate('/play/new-match') }, t.newMatch));

  function update() {
    const ds = store.get();
    if (!currentNight(ds)) {
      if (store.isLoaded()) navigate('/play');
      else root.replaceChildren(h('p', { class: 'muted' }, t.loading));
      return;
    }
    const match = latestMatch(ds);
    if (!match) {
      root.replaceChildren(noMatch());
      return;
    }
    const games = gamesOf(ds, match.matchId);
    const totals = score(games);
    const winner = winnerOf(games);
    root.replaceChildren(
      h('section', { class: 'match stack' },
        h('h1', {}, t.matchTitle(parseMatchId(match.matchId).number)),
        h('div', { class: 'teams' }, teamPanel(match, 'A', totals.A, winner), teamPanel(match, 'B', totals.B, winner)),
        h('p', { class: 'muted center' }, t.draws(totals.D)),
        h('ol', { class: 'sequence' }, games.map((g) => h('li', { 'data-side': g.result }, t.resultShort[g.result]))),
        winner ? winnerBanner(match, winner, totals) : resultButtons(),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: undo }, t.undo)),
    );
  }

  update();
  store.refresh();
  return { update, destroy: () => clearInterval(poll) };
}
```

- [ ] **Step 3: Fill `docs/css/views/play.css`**

```css
/* Side colours: data-side="A" | "B" | "D" | "bench" is used on panels, buttons and chips. */
[data-side="A"] { --side: var(--team-a); }
[data-side="B"] { --side: var(--team-b); }
[data-side="D"] { --side: var(--draw); }
[data-side="bench"] { --side: var(--border); }

.assign-list {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  list-style: none;
}

.assign-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-left: 6px solid var(--side);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
}

.assign-side {
  color: var(--side);
  font-weight: 600;
}

.assign-row[data-side="bench"] .assign-side {
  color: var(--text-muted);
}

.teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.team-panel {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  border: 1px solid var(--border);
  border-top: 6px solid var(--side);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
}

.team-panel[data-winner="true"] {
  border-color: var(--side);
  box-shadow: 0 0 0 2px var(--side);
}

.team-names {
  font-weight: 600;
}

.score {
  font-size: var(--text-score);
  font-weight: 750;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--side);
}

.sequence {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
  min-height: 28px;
  padding: 0;
  list-style: none;
}

.sequence li {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--side);
  color: var(--bg);
  font-size: var(--text-sm);
  font-weight: 700;
}

.result-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
}

.btn-result {
  min-height: 88px;
  padding: 0 var(--space-2);
  border: 2px solid var(--side);
  background: var(--surface);
  font-size: var(--text-lg);
}

.btn-result:active {
  background: var(--side);
  color: var(--bg);
}

.winner-banner {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 2px solid var(--side);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
  font-size: var(--text-lg);
  font-weight: 700;
}
```

- [ ] **Step 4: Verify in the browser** (offline mode is fine; with API configured, also watch the sheet)

1. From the home card → "Fortsett kvelden" → "Ingen kamp i gang." + "Ny kamp".
2. New match: tap names; each tap cycles Benk → Lag A → Lag B with coloured rows; a full team is skipped. "Start kampen" is enabled only at 2 + 2.
3. Match screen: two panels with names and 0, three large buttons. Record D, A, A, B, A → sequence `U A A B A`, score 3–1, buttons replaced by the winner banner.
4. A fast double tap records only one game.
5. "Angre" on the completed match removes the last game and brings the buttons back.
6. "Neste kamp" → new match → start → "Kamp 2".
7. Start a match, record one game, go to new match and start another → confirm dialog "Kampen står 1–0…". Cancel keeps it; OK creates the next match.
8. Start a match, record nothing, go to new match and start another → no dialog; the empty match is replaced (same number).
9. Narrow viewport (DevTools iPhone SE, 375 px): nothing overflows; buttons are reachable with the tab bar visible.

- [ ] **Step 5: Commit**

```bash
git add docs/js/views/play docs/css/views/play.css
git commit -m "feat(play): new-match and match screens with undo and winner banner"
```

---

### Task 12: Connect, test end-to-end, publish

- [ ] **Step 1: Set `API_URL`** in `docs/js/config.js` to the URL from Task 8 Step 6. Commit:

```bash
git add docs/js/config.js
git commit -m "chore: point app at Apps Script deployment"
```

- [ ] **Step 2: End-to-end on localhost**

1. `npm run serve`, open http://localhost:8000 in two browser windows (simulating two phones).
2. Window 1: start a night. A PIN prompt appears on the first write; enter the PIN. Within ~2 s the badge disappears and the Nights tab shows the row. (If you cancel the prompt, the badge shows "PIN trengs"; tapping it prompts again.)
3. Window 1: new match, record games. Matches/Games rows appear; the `status` column shows e.g. `ikke ferdig 1–0`, then `A vant 3–1`.
4. Window 2: open the match screen; results from window 1 appear within ~5 s.
5. Conflict: in DevTools set window 2 offline, start "Kamp N" with different teams and record a game; in window 1 start "Kamp N" online. Bring window 2 online → toast "Noen andre startet kamp N…", window 2 shows window 1's match, and no games from window 2 were written to the sheet.
6. Undo from window 1 removes the row in Games.

- [ ] **Step 3 (user confirmation required): Create the GitHub repo and push**

Ask the user for the repository name and visibility before running anything. Then, for example:

```bash
gh repo create <name> --public --source . --push
```

- [ ] **Step 4 (user): Enable Pages and the custom domain**

1. GitHub → repo → Settings → Pages → Source: **Deploy from a branch**, Branch `main`, folder `/docs`.
2. DNS at rodland.no: CNAME `sjineser` → `<github-user>.github.io`.
3. When the certificate is issued, tick **Enforce HTTPS**.

Expected: https://sjineser.rodland.no loads the app.

- [ ] **Step 5: Phone check**

On an iPhone (Safari) and an Android phone (Chrome): run through Task 11 Step 4 items 1–6. Check: no zoom when focusing the name field, header/tab bar clear of the notch and home indicator, large buttons easy to hit one-handed, dark/light follows the phone setting.

- [ ] **Step 6: Final commit if anything changed**

```bash
git status
```
