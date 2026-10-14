# Sjineser — Design

A mobile-first web app for recording and analysing results of the card game *sjineser*.
Results are entered at the table during a game night; an extensive statistics section
is available to everyone.

## 1. Domain

- **Player** — a person who plays. Picked from a list; new players can be added.
- **Night** — a game night on a date, with a fixed roster of players (≥ 4).
- **Match** — two teams of two players drawn from the night's roster. Rosters larger
  than 4 means some players sit out a match.
- **Game** — one deal within a match. Result is exactly one of: team A wins, team B wins, draw.
- A match is **complete** when one team reaches 3 game wins. Draws do not count towards 3,
  so a match may contain any number of games.
- A match that never reaches 3 is **incomplete** (abandoned). Its games count in all
  game-level stats and Elo; the match is excluded from match-level stats.
- Teams rotate after every match. A typical night: 4 players, 3 matches, everyone
  partners everyone once. Nights rarely exceed 4 matches.
- **Season** — half-year: 1 Jan–30 Jun and 1 Jul–31 Dec. A night belongs to the season
  of its date.

## 2. Architecture

```
Browser (GitHub Pages, static)  ──HTTPS/JSON──▶  Apps Script web app  ──▶  Google Sheet
 html / css / js (ES modules)                     (standalone, owned       (private)
 localStorage: cache, outbox, PIN                  by the developer)
```

- **Frontend:** plain HTML, CSS and JavaScript ES modules. No build step, no runtime
  dependencies. JSDoc type annotations. Served by GitHub Pages from the repo.
- **Backend:** a standalone Google Apps Script project, deployed as a web app
  ("execute as me, anyone can access"). It locates the sheet by an ID stored in
  Script Properties — never in code. Pushed from the repo with `clasp`.
- **Data store:** a Google Sheet, private. The developer needs Editor access.
  Development uses the developer's own sheet; switching to the real sheet means
  changing the Script Property and running `setup()` there.
- The backend is deliberately thin: validate, lock, read/append/delete rows.
  All logic lives in the frontend domain layer. Replacing the backend later only
  touches `apps-script/` and `js/api/`.

## 3. Data model (sheet tabs)

Player names are the keys across tabs (readable and hand-editable; a rename is a
find-and-replace).

**Players**

| name | active |
|---|---|
| Hans | TRUE |

`active = FALSE` hides a player from pickers but keeps their history.

**Nights**

| date | players |
|---|---|
| 2026-10-14 | Frode, Hans, Tor, Per |

**Matches**

| matchId | date | A1 | A2 | B1 | B2 | status |
|---|---|---|---|---|---|---|
| 2026-10-14#1 | 2026-10-14 | Hans | Frode | Tor | Per | A won 3–1 |

- `matchId` = night date + `#` + running number within the night.
- `status` is a **sheet formula** (single ARRAYFORMULA in the header row) computed
  from Games, for human readers only. The app never writes or reads it.
- Player columns have data validation from Players (protects hand edits).

**Games**

| matchId | gameNo | result | timestamp |
|---|---|---|---|
| 2026-10-14#1 | 1 | D | 2026-10-14T20:13:05Z |

`result` ∈ `A`, `B`, `D`.

**Derived, never stored:** match completion and score, current night (latest Nights
row), current match (latest incomplete match of the current night), sit-outs
(players on the night roster but not in a match), seasons, all stats.

`setup()` in the Apps Script creates tabs, headers, the status formula and data
validation. It is idempotent and is run once per sheet.

Historical data from the existing sheet is imported later by a one-off script, once
its format is known. Not part of the first version.

## 4. Backend API (Apps Script)

| Method | Action | Payload | Behaviour |
|---|---|---|---|
| GET | — | — | Returns `{ players, nights, matches, games }` as JSON. |
| POST | `addPlayer` | `{ name }` | No-op if exists. |
| POST | `startNight` | `{ date, players }` | No-op if identical night exists; error if date exists with a different roster. |
| POST | `startMatch` | `{ matchId, date, A1, A2, B1, B2 }` | No-op if identical; `conflict` error if `matchId` exists with different players. |
| POST | `addGame` | `{ matchId, gameNo, result }` | No-op if `(matchId, gameNo)` exists with the same result; `conflict` otherwise. |
| POST | `deleteGame` | `{ matchId, gameNo }` | Deletes the row if present. |
| POST | `deleteMatch` | `{ matchId }` | Only allowed when the match has no games. |

- Every POST carries `pin`; checked against Script Property `PIN`. Reads are public.
- POST bodies are sent as `text/plain` JSON to avoid CORS preflight.
- All writes run under `LockService` to serialise concurrent phones.
- Every write is idempotent, keyed on its natural key, so the outbox can retry freely.

## 5. Frontend structure

```
index.html            markup shell only — no inline CSS or JS
manifest.webmanifest  PWA manifest
sw.js                 service worker: caches the app shell
css/                  base.css, layout.css, components.css, views/*.css
js/
  main.js             bootstraps app, router
  config.js           Apps Script URL and other constants
  router.js           hash routing (#/play, #/stats/players/Hans, …)
  api/                the only code that knows the backend exists
    client.js         fetch wrapper (GET all, POST action)
  state/              persistence on the phone
    cache.js          last fetched dataset
    outbox.js         queued writes, retry, unsynced count
    store.js          dataset = cache + pending outbox ops applied optimistically
  domain/             pure functions; no DOM, no network, no storage
    match.js          score, completion, current night/match, sit-outs
    season.js         season of a date, season ranges
    elo.js            rating engine + documented constants
    proposal.js       team proposal rules (as data) + engine
    stats/            one module per area: overall, records, player, pairs, compare
  views/              rendering only; read from store, call domain, dispatch actions
    play/             home, start-night, new-match, match
    stats/            overall, players, player, pairs, pair, compare
    about/            how-teams-are-proposed, how-ratings-work
    components/       shared UI pieces (chips, tables, svg charts, toasts)
  i18n/nb.js          all user-visible Norwegian text
apps-script/          Code.gs, appsscript.json, .clasp.json
tests/                node --test suites for domain/ (and state/ where pure)
```

Rules:
- `domain/` imports nothing outside `domain/`.
- `views/` never call `api/` directly; writes go through `state/` actions.
- No user-visible strings outside `i18n/nb.js`.
- Each file has one purpose; large files are a signal to split.

## 6. Screens and flows

Bottom tab bar: **Spill** (Play) and **Statistikk** (Stats). Hash routes; links are shareable.

1. **Play home** — "Fortsett kveld 14. okt" (continue the latest night) or "Ny kveld".
   The current night is the latest night, not "today" (nights run past midnight).
2. **Start night** — tap players from the active Players list, or add a new player.
   Saves a Nights row.
3. **New match** — the app proposes teams (and sit-outs) with a one-line reason per
   decision; the user may override by tapping players between teams/bench. Start.
   If a match is still incomplete, the app asks to abandon it first.
4. **Match** — two large team panels, large score (e.g. **2 – 1**), the game sequence
   (D A D B …), three large buttons: *Lag A vant* / *Uavgjort* / *Lag B vant*, and
   *Angre* (undo). At 3 wins: a prominent winner banner and a *Neste kamp* button
   showing the next proposal.
5. **Stats** — sections below, all with a season filter: this season / a past season /
   all time.
6. **About** — "Slik foreslås lag" and "Slik fungerer rating", generated from the
   rule and constant definitions in `domain/`.

Undo removes the last game of the current match (from the outbox if unsent, otherwise
via `deleteGame`). With no games, undo removes the match itself.

## 7. Team proposal

Rules are defined as data in `domain/proposal.js`: each rule has an id, a Norwegian
title, a description and its scoring logic. The About page and the per-proposal
reasons are rendered from these definitions, so documentation cannot drift from code.

**Step 1 — who plays** (only when roster > 4), applied in order:
1. Fewest matches played tonight play.
2. Tie: most sit-outs this season play.
3. Tie: longest since last played plays.
4. Tie: alphabetical (deterministic).

**Step 2 — split the 4 players.** Score each of the 3 possible splits; lowest wins:
1. Pairs already partnered tonight — heavy penalty (primary rule: everyone partners everyone).
2. Absolute Elo difference between the teams (balance).
3. Times each pair has partnered this season — small penalty (variety).

With 4 players over 3 matches, each split occurs once; Elo decides order (most balanced first).

## 8. Elo

- Updated **per game**, chronologically over all games (incomplete matches included).
- Team rating = mean of its two players. Expected score
  `E = 1 / (1 + 10^((Rb − Ra) / 400))`. Actual score: win 1, draw ½, loss 0.
- Both partners receive `K × (S − E)`.
- Constants (in `domain/elo.js`, shown on the About page): start **1000**, **K = 24**,
  provisional for the first **10** games.
- One continuous rating, never reset. Season views show rating at season end and
  the change during the season.

## 9. Statistics

All views take a season filter. Match-level stats use complete matches only;
game-level stats and Elo use all games.

**Overall**
- Leaderboard: Elo, provisional marker, season change, sparkline.
- Season summary: nights, matches, games, draw %.
- Records: longest match (games), longest draw streak, most draws in a match,
  clean sweeps (3–0 with no draws), comebacks (0–2 → 3–2), biggest upset (largest
  Elo gap beaten), highest Elo ever, longest win streak.
- Night winners: largest Elo gain per night.

**Player** (list → detail)
- Elo over time (chart).
- Games and matches played; W/D/L; game win %; match win %.
- Streaks, current and longest: wins, unbeaten, losses.
- Form (last 10 games), nights attended, sit-outs.
- Partners table → best/worst partner. Opponents table → nemesis / favourite victim.

**Pairs** (list → detail)
- Sortable: matches W/L, games W/D/L, win %, combined Elo.
- Detail: head-to-head against other pairs.

**Compare** — pick two players: record as partners, record as opponents, Elo curves
overlaid, key numbers side by side.

Layout: stacked cards on mobile; multi-column with full tables and charts on wide
screens. Charts are hand-rolled SVG components.

## 10. Sync and error handling

- **Optimistic UI + outbox:** every action is applied locally at once and queued in
  `localStorage`; the outbox flushes in order, retries on `online`/visibility events,
  and shows an unsynced badge. Input is never lost to network errors.
- **Conflicts:** a `conflict` response (e.g. another phone started match #2 with
  different teams) drops the op, shows a toast ("Noen andre startet kamp 2") and
  refetches.
- **Wrong PIN:** writes are held in the outbox; the user is prompted for the PIN.
- **Freshness:** full dataset cached locally for instant start; refreshed on open,
  and polled every ~5 s while a match screen is visible.

## 11. Mobile requirements

- iOS Safari and Android Chrome, both in browser and installed (PWA, standalone).
- Safe-area insets; `dvh` units; tap targets ≥ 44 px; `touch-action: manipulation`
  on buttons; no hover-dependent interaction; works one-handed.
- Responsive up to laptop widths; stats use extra width.

## 12. Testing

- `node --test` suites for all of `domain/` using small hand-built fixture datasets:
  match state, seasons, Elo, proposal rules, every stat.
- Outbox/store logic tested where it is pure.
- Apps Script kept thin; verified manually against the dev sheet.
- Manual checklist for iOS Safari and Android Chrome before each release.

## 13. Deployment

- GitHub repo; GitHub Pages serves the repo root from `main`.
- Apps Script pushed with `clasp`, deployed as a web app; URL in `js/config.js`.
- Script Properties: `SHEET_ID`, `PIN`.

## 14. Out of scope (first version)

- Import of historical data (separate task once the real sheet is available).
- Editing history in the app (edit the sheet directly).
- Accounts / per-user login.
