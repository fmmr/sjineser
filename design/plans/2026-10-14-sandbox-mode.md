# Sjineser — Sandbox Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `?sandbox` in the URL runs the app against an in-browser fake backend with generated, deterministic history, a pretend "today", a reset button and a visible TESTMODUS bar — without touching the Google Sheet.

**Architecture:** Spec §17. The fake backend is a second implementation of the `api` interface (`getAll()`, `post(action, payload, pin)` → envelopes) built on `domain/dataset.js` `applyOp`. `main.js` (composition root) picks real or sandbox wiring. "Today" comes from a clock object instead of `new Date()` in actions/views. Sandbox storage uses its own prefix.

**Tech Stack:** Plain JS ES modules, JSDoc, `node --test`. No dependencies.

**Existing code** (read first): `docs/js/main.js`, `docs/js/api/client.js` (envelope contract), `docs/js/domain/dataset.js` (`applyOp`, `emptyDataset`), `docs/js/domain/proposal.js` (`proposeTeams`), `docs/js/domain/elo.js` (`rateGames`, `expectedScore`, `ELO`), `docs/js/domain/match.js`, `docs/js/state/storage.js` (`createStorage(backend, prefix)`), `docs/js/state/actions.js` (`today` option), `docs/js/views/play/home.js` (uses `toISODate(new Date())`), `docs/js/views/shell.js`, `docs/index.html`, `docs/css/layout.css`, `tests/helpers.js` (`memoryBackend`).

Conventions: 2-space indent, single quotes, semicolons, JSDoc on exports, no default exports; domain imports only domain; all user-visible text in `docs/js/i18n/nb.js`; no inline CSS/JS in HTML.

---

### Task 1: Seeded random numbers

**Files:** Create `docs/js/sandbox/random.js`; Test `tests/sandbox/random.test.js`

- [ ] Test first: same seed → same sequence; different seeds → different sequences; `next()` in [0, 1); `int(min, max)` inclusive bounds; `pick(array)` returns an element; `chance(p)` is boolean.
- [ ] Implement (mulberry32):

```js
/** Deterministic pseudo-random numbers (mulberry32). Same seed, same sequence. */
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
    /** Returns a shuffled copy. */
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}
```

- [ ] `npm test` passes. Commit `feat(sandbox): seeded random numbers`.

---

### Task 2: Generated history

**Files:** Create `docs/js/sandbox/generate.js`; Test `tests/sandbox/generate.test.js`

Export `SANDBOX_SEED = 2026`, `SANDBOX_PLAYERS` (six names: `Anne`, `Bjørn`, `Cato`, `Dag`, `Erik`, `Frida`), and `generateHistory(seed = SANDBOX_SEED)` returning `{ dataset, nextDate }`.

Requirements:
- Build the dataset **only** by folding ops through `applyOp` starting from `emptyDataset()`; throw if any op's outcome is not `'applied'` (a generator bug must fail loudly in tests).
- Players: `addPlayer` for all six.
- Hidden skill per player (not stored): `Anne +80, Bjørn +40, Cato +10, Dag −10, Erik −40, Frida −80` (rating offsets around `ELO.START`).
- Nights: first night `2025-08-21`; each next night 14–35 days later (`random.int`); stop before `2026-10-01` (gives ~15–18 nights over seasons 2025 H2, 2026 H1, 2026 H2). Write a small date helper (add days to `YYYY-MM-DD` using UTC to avoid DST issues).
- Roster per night: 4 players (60 %), 5 (30 %), 6 (10 %), chosen with `shuffle`, then sorted by name; `startNight`.
- Matches per night: 3 (70 %) or 4. For each: `proposeTeams(ds, rateGames(ds))` gives the teams; `startMatch` with `matchId = makeMatchId(date, n)`.
- Games: until a team has 3 wins. Each game: draw with probability 0.35; otherwise team A wins with probability `expectedScore(skillA, skillB)` where a team's skill is the mean of its players' `ELO.START + offset`. `addGame` with `gameNo` 1…, `timestamp` `${date}T20:${mm}:00Z` (mm = 2 × gameNo, two digits, cap at 59).
- Abandon: on a night's **last** match, with probability 0.15, stop as soon as either team reaches 2 wins (leaves an incomplete match with games).
- Guard: max 40 games per match (stop, leaving it incomplete).
- `nextDate` = last night's date + 14 days.

Tests:
- Deterministic: two calls with the same seed deep-equal; a different seed differs.
- Valid: generation does not throw; every match has at least one game; every game's match exists; every match's four players are on that night's roster.
- Shape: ≥ 15 nights; nights span ≥ 3 seasons (`seasonOf`); at least one roster of 5+; at least one incomplete match; draw share across all games between 0.25 and 0.45; `nextDate` is 14 days after the last night.
- Realism: with the default seed, `rateGames` ranks Anne above Frida.
- Speed: generation takes < 1 s (measure with `performance.now()`).

Commit `feat(sandbox): deterministic generated history`.

---

### Task 3: Fake backend

**Files:** Create `docs/js/sandbox/backend.js`; Test `tests/sandbox/backend.test.js`

```js
/**
 * In-browser stand-in for the Apps Script API: same interface and envelopes as api/client.js,
 * same rules via applyOp. Any PIN is accepted. Data persists in the given storage.
 */
export function createSandboxApi({ storage, seed = SANDBOX_SEED }) { … return { getAll, post, reset }; }
```

Requirements:
- Data lives under storage key `'sandboxData'` (not `'dataset'`, which the store uses for its cache in the same namespace). On first use (no `sandboxData`) seed it with `generateHistory(seed).dataset` and store `today` = `nextDate` (key `'today'`) if not set.
- `getAll()` → `Promise.resolve({ ok: true, result: 'noop', data: <dataset> })` (return a structured clone so callers cannot mutate storage state).
- `post(action, payload)` → apply with `applyOp`; `applied` → persist, `{ ok: true, result: 'applied' }`; `noop` → `{ ok: true, result: 'noop' }`; `conflict`/`invalid` → `{ ok: false, error, message: error }`. For `addPlayer` include `data: { name }` like the server.
- `reset()` → regenerate, overwrite `sandboxData` and `today` (= `nextDate`).

Tests (use `createStorage(memoryBackend(), 'sjineser-sandbox:')`): first `getAll` returns generated data; `post` applies and persists across a new `createSandboxApi` on the same storage; duplicate game → `noop`; conflicting game → `{ ok: false, error: 'conflict' }`; `getAll` result mutation does not leak; `reset` restores the generated dataset.

Commit `feat(sandbox): fake backend on applyOp`.

---

### Task 4: Clock

**Files:** Create `docs/js/state/clock.js`; Test `tests/state/clock.test.js`; Modify `docs/js/views/play/home.js`

```js
/**
 * Source of "today" for the app. Real mode: the device's local date.
 * Sandbox mode: a pretend date kept in storage (key 'today').
 */
export function createClock({ storage = null, now = () => new Date() } = {}) {
  return {
    today: () => storage?.get('today', null) ?? toISODate(now()),
    setToday: (date) => { if (storage && isISODate(date)) storage.set('today', date); },
  };
}
```

- Tests: without storage → `toISODate(now())`; with storage and a stored date → that date; `setToday` ignores invalid dates.
- `home.js`: replace `toISODate(new Date())` with `clock.today()` from `ctx` (`mountHome(root, { store, navigate, clock })`); drop the `dates.js` import there.

Commit `feat(state): clock as the single source of today`.

---

### Task 5: Wiring and sandbox bar

**Files:** Modify `docs/js/main.js`, `docs/js/views/shell.js` (only if needed), `docs/index.html`, `docs/js/i18n/nb.js`, `docs/css/layout.css`; Create `docs/js/views/sandbox-bar.js`, `docs/css/sandbox.css`

- `main.js`:
  - `const sandbox = new URLSearchParams(location.search).has('sandbox');`
  - `storage = createStorage(localStorage, sandbox ? 'sjineser-sandbox:' : 'sjineser:')`
  - `api = sandbox ? createSandboxApi({ storage }) : createApiClient({ url: API_URL })`
  - `clock = createClock({ storage: sandbox ? storage : null })`
  - `createActions({ store, outbox, today: clock.today })`; add `clock` to the router `ctx`.
  - In sandbox mode: `mountSandboxBar({ clock, api, storage, onDateChange: () => store.recompute() … })` — after a date change, re-render the current view (the router re-renders on store notifications; if the view is unchanged, trigger a hash re-render, e.g. `window.dispatchEvent(new HashChangeEvent('hashchange'))`).
- `index.html`: add `<div id="sandbox-bar" class="sandbox-bar" hidden></div>` right after the header, and `<link rel="stylesheet" href="css/sandbox.css">`.
- `sandbox-bar.js` `mountSandboxBar({ clock, api, storage, onDateChange })`: un-hides the bar, adds class `sandbox` to `<body>`, renders: label `t.sandbox.label` ("TESTMODUS"), a `<input type="date">` bound to `clock.today()` (change → `clock.setToday`, `onDateChange()`), button `t.sandbox.reset` ("Nullstill") → `window.confirm(t.sandbox.resetConfirm)` → `api.reset()`, clear the sandbox outbox and cache (`storage.set('outbox', [])`, `storage.set('dataset', null)`), then `location.reload()`, and a link `t.sandbox.exit` ("Avslutt") to `location.pathname + location.hash` (no query).
- `nb.js`: `sandbox: { label: 'TESTMODUS', reset: 'Nullstill', resetConfirm: 'Tilbakestille testdataene?', exit: 'Avslutt', date: 'Dato' }` (use `date` as the input's aria-label).
- CSS: a slim bar fixed under the header (warning colour background `var(--warning)`, dark text, `--sandbox-height: 44px` token in `tokens.css`), and when `body.sandbox` the main padding-top adds `--sandbox-height` (`layout.css`). Controls use `min-height: var(--tap)`-compatible sizing within the bar (bar height = tap height).

Verify: `npm test`; `node --check`; serve `docs/` on a free port (not 8000) and curl the new modules (200). Controller does browser checks.

Commit `feat(sandbox): ?sandbox mode with bar, pretend date and reset`.

---

### Task 6: Controller verification

- Headless: open `/?sandbox#/play` → TESTMODUS bar visible; home shows the last generated night; pretend date = next date → "Ny kveld" enabled; start a night with 5 players → proposal reasons reflect season history (sit-outs/new partners); play a match; "Nullstill" restores; `/#/play` (no sandbox) shows real data unchanged (sandbox storage separate).
- Code review, fix findings, push as `fmmr`.
