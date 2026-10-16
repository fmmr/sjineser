# Sjineser — Design

A mobile-first web app for recording and analysing results of the card game *sjineser*.
Results are entered at the table during a game night; an extensive statistics section
is available to everyone.

## 1. Domain

- **Player** — a person who plays. Picked from a list; new players can be added.
- **Night** — a game night on a date, with a fixed roster of players (≥ 4).
- **Match** — two teams of 2 or 3 players drawn from the night's roster (§18). On a
  3-player team two play each game and rotate; the team result is shared. Rosters larger
  than 6 means some players sit out a match (and anyone may be benched by hand).
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

- **Frontend:** plain HTML, CSS and JavaScript ES modules. No build step (a release only
  stamps `sw.js`, §10), no runtime
  dependencies. JSDoc type annotations. Served by GitHub Pages from the `docs/` folder.
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

**Managing players** (Mer → Spillere, §6; ops in §4):
- **Rename** (`renamePlayer`) changes the Players row, every Nights roster containing the old
  name and every Matches seat (A1–B3) equal to it, in one locked server request (Players first,
  so the seat validation accepts the new name). The new name follows the name rules below and
  must not belong to another player; another casing of the same player is allowed.
- **Deactivate / activate** (`setPlayerActive`) flips `active`.
- **Delete** (`deletePlayer`) is allowed only for a player with no history (on no night
  roster and in no match seat); everyone else can only be deactivated.
- Merging two players (e.g. duplicate casing) is not supported (backlog).

**Nights**

| date | players |
|---|---|
| 2026-10-14 | Frode, Hans, Tor, Per |

**Matches**

| matchId | date | A1 | A2 | A3 | B1 | B2 | B3 | status |
|---|---|---|---|---|---|---|---|---|
| 2026-10-14#1 | 2026-10-14 | Hans | Frode | | Tor | Per | | A won 3–1 |
| 2026-10-14#2 | 2026-10-14 | Hans | Tor | Kari | Frode | Per | | B won 3–2 |

- `matchId` = night date + `#` + running number within the night.
- A3 / B3 are blank for a 2-player team (the app stores `''`; an op without them means a
  2-player team). Each team has 2–3 distinct players and nobody is on both teams (§18).
- `status` is a **sheet formula** (single ARRAYFORMULA in the header row) computed
  from Games, for human readers only. The app never writes or reads it.
- Player columns (C–H) have data validation from Players (protects hand edits; blank
  cells pass, so the third seats may stay empty). `status` is column I.

**Games**

| matchId | gameNo | result | timestamp |
|---|---|---|---|
| 2026-10-14#1 | 1 | D | 2026-10-14T20:13:05Z |

`result` ∈ `A`, `B`, `D`. `timestamp` is set by the client when the result is
entered (informational only; never used for ordering).

**Derived, never stored:** match completion and score, current night (the Nights
row with the latest date), latest match and current match (see below), sit-outs (players on the night roster but not in a
match), seasons, all stats.

**Latest match** = the highest-numbered match of the current night.
**Current match** = the latest match, *if* it is incomplete; otherwise there is none. **Abandoning** a match is implicit: starting the
next match leaves it incomplete. If the abandoned match has 0 games it is deleted
instead. This applies to every removal (abandon or undo): a match number is reused only
when no op referencing it may still reach the server. If its `startMatch` was never sent
it is simply retracted and the number is free again; otherwise a `deleteMatch` is queued,
and while any op naming that number is pending, the next match skips it (gaps are fine).

**Canonical game order** (used by Elo, streaks, records — everywhere): night date,
then numeric match number (parsed from `matchId`; never a string sort, `#10` > `#2`),
then `gameNo`. The domain layer exposes one sort function for this.

**Player names** are trimmed, must be non-empty, must not contain commas (Nights joins them with `, `),
and are unique case-insensitively. Enforced in both UI and `addPlayer` / `renamePlayer`.

**Sheet hygiene** (enforced by `setup()` and the script):
- Date and timestamp columns are formatted as plain text so Sheets does not coerce
  them to Date objects; the GET handler still normalises values defensively
  (dates → `YYYY-MM-DD` strings, `active` → boolean).
- The status ARRAYFORMULA leaves unused rows truly blank (e.g. `IF(A2:A="",,…)`).
- The script computes the next row from column A rather than relying on
  `appendRow`/`getLastRow`, and writes only columns A–H of Matches.

`setup()` in the Apps Script creates tabs, headers, formats, the status formula and
data validation. It is idempotent and is run once per sheet.

A night's roster is fixed once started. A late arrival requires editing the sheet;
roster editing in the app is out of scope.

Historical data from the existing sheet is imported later by a one-off script, once
its format is known. Not part of the first version.

## 4. Backend API (Apps Script)

| Method | Action | Payload | Behaviour |
|---|---|---|---|
| GET | — | — | Returns the envelope with `data: { players, nights, matches, games }`. |
| POST | `addPlayer` | `{ name }` | `noop` if exists (case-insensitive); `invalid` if name breaks the rules. `data.name` returns the canonical stored name. (Accepted limitation: if two phones add the same name with different casing at the same moment, the second phone's roster keeps its own casing until corrected in the sheet.) |
| POST | `renamePlayer` | `{ from, to }` | Renames in Players, every Nights roster and every Matches seat. `noop` if `from` is absent but `to` exists (a retry after success) or if the stored name already is `to`; `conflict` if `to` belongs to another player (case-insensitive); `invalid` if `to` breaks the name rules or neither name exists. |
| POST | `setPlayerActive` | `{ name, active }` | Sets `active`; `noop` if it already has that value; `invalid` if the player is unknown or `active` is not a boolean. |
| POST | `deletePlayer` | `{ name }` | Deletes the Players row; `noop` if absent; `invalid` if the player is on any night roster or in any match seat. |
| POST | `startNight` | `{ date, players }` | `noop` if identical night exists; `conflict` if date exists with a different roster. |
| POST | `startMatch` | `{ matchId, date, A1, A2, A3?, B1, B2, B3? }` | `noop` if identical (a missing third seat equals a blank one); `conflict` if `matchId` exists with different players; `invalid` unless each team has 2–3 distinct players and nobody is on both teams. |
| POST | `addGame` | `{ matchId, gameNo, result, timestamp }` | `noop` if `(matchId, gameNo)` exists with the same result; `conflict` if different result; `invalid` if the match does not exist. |
| POST | `deleteGame` | `{ matchId, gameNo }` | Deletes the row; `noop` if absent. |
| POST | `deleteMatch` | `{ matchId }` | Deletes the row; `noop` if absent; `invalid` if the match has games. |

- Every POST carries `pin`; checked against Script Property `PIN`. Reads are public.
- POST bodies are sent as `text/plain` JSON with no custom headers (a CORS "simple
  request"; fetch follows Apps Script's 302 redirect).
- All writes run under `LockService.getScriptLock()` with `waitLock` and a timeout;
  failure to acquire returns `busy`.
- Every write is idempotent, keyed on its natural key, so the outbox can retry freely.

**Response envelope.** Apps Script cannot set HTTP status codes (every reply is 200),
so outcome is carried in the body. GET and POST use the same envelope:

```json
{ "ok": true,  "result": "applied" | "noop", "data": { … } }
{ "ok": false, "error": "conflict" | "pin" | "invalid" | "busy", "message": "…" }
```

| Outcome | Outbox behaviour |
|---|---|
| `ok` (`applied` / `noop`) | Remove op, continue. |
| `conflict` | Drop op **and cascade** (§10), toast, refetch. |
| `invalid` | Drop op and cascade, toast (indicates a bug or a hand edit), refetch. |
| `pin` | Hold the whole outbox; prompt for PIN; resume. |
| `busy`, network error, non-JSON reply | Keep op; retry with backoff. |

## 5. Frontend structure

```
docs/                   the published site (GitHub Pages: branch main, folder /docs)
  CNAME                 sjineser.rodland.no
  index.html            markup shell only — no inline CSS or JS
  manifest.webmanifest  PWA manifest
  sw.js                 service worker: one versioned cache of every shipped file
  css/                  tokens.css, base.css, layout.css, components.css, views/*.css
  js/
    main.js             bootstraps app, router
    theme-init.js       classic script in <head>: applies the theme before first paint
    theme.js            theme resolution, choice (System/Mørk/Lys) and following the device
    config.js           Apps Script URL and other constants
    about-data.js       code statistics for the about page, generated by `npm run stamp`
    router.js           hash routing (#/play, #/stats/players/Hans, …)
    routing.js          pure route helpers: hash parsing, active tab, test-mode URL
    api/                the only code that knows the backend exists
      client.js         fetch wrapper (GET all, POST action)
    state/              persistence on the phone
      storage.js        JSON wrapper around localStorage (injectable for tests)
      outbox.js         queued writes, serial flush, retry, cascade, unsynced count
      store.js          dataset = cached server data + pending ops applied optimistically
      actions.js        user intents → validated ops (the only way views write)
    domain/             pure functions; no DOM, no network, no storage
      dates.js          local ISO dates
      players.js        name rules, lookup, history and per-player overview (Spillere)
      match.js          ids, canonical order, score, completion, current night/match
      dataset.js        applyOp: idempotent op application (same rules as the server)
      season.js         season of a date, season ranges
      elo.js            rating engine + documented constants
      proposal.js       team proposal rules (as data) + engine
      stats/            one module per area: overall, records, player, pairs, compare
    views/              rendering only; read from store, call domain, dispatch actions
      play/             home, start-night, new-match, match
      stats/            overall, players, player, pairs, pair, compare
      more/             Mer: players, settings, explanations and about, as grouped lists; players (Spillere)
      about/            about (links, data, code stats, version), how-teams-are-proposed, how-ratings-work
      components/       shared UI pieces (chips, tables, toasts, sheets, grouped lists, chart.js wrapper)
    i18n/nb.js          all user-visible Norwegian text
  vendor/               pinned third-party ES modules (Chart.js)
apps-script/            Code.gs, appsscript.json, .clasp.json — not published
scripts/                stamp-sw.mjs: stamps sw.js for a release (`npm run stamp`) — not published
tests/                  node --test suites for docs/js/domain (and state/ where pure)
design/                 specs and plans — not published
```

Rules:
- `domain/` imports nothing outside `domain/`.
- `views/` never call `api/` directly; writes go through `state/` actions.
- No user-visible strings outside `i18n/nb.js`.
- Each file has one purpose; large files are a signal to split.

## 6. Screens and flows

Navigation is the bottom tab bar and nothing else: **Spill** (Play, `#/play`), **Statistikk**
(Stats, `#/stats`) and **Mer** (More, `#/more`). Hash routes; links are shareable. The active
tab follows the path (`routing.js` `activeTab`): `/stats…` → Statistikk; `/more…` and `/about…`
→ Mer; everything else → Spill. The header holds only the logo and name (home link) and the
sync badge. Links inside screens are contextual only (e.g. "Alle par" on the stats overview,
"Slik foreslås lag" under the team proposal).

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
6. **Mer** — grouped lists in the style of the iOS settings (section heading; rows of
   label + trailing control or chevron, hairline separators, ≥ 48 px tall):
   - *Spill:* **Spillere** (`#/more/players`, Mer tab active) — a field to add a player (same
     rules and messages as on Start night), then the players grouped *Aktive* / *Inaktive*,
     sorted by name (Norwegian collation). Each row: name, "N spill · sist 14. okt. 2026" (or
     "Ikke spilt ennå"), an active switch and a trailing "…" button. "…" opens a bottom sheet with
     *Endre navn* (a sheet with the name prefilled; problems are shown under the field as you
     type) and *Slett* (a destructive confirmation; disabled, with the reason, for players with
     history — deactivate them instead). Inactive players stay out of the Start night picker.
   - *Innstillinger:* **Tema** — segmented control System · Mørk · Lys (radio group, §11);
     **Testmodus** — a switch that reloads the current screen into or out of `?sandbox` (§17).
   - *Forklaringer:* "Slik foreslås lag" and "Slik fungerer rating", generated from the
     rule and constant definitions in `domain/`.
   - *Om:* "Om Sjineser" (intro, links, live data counts, code statistics, version), GitHub and
     the Google Sheet (new tab; the sheet opens only for those it is shared with), and the
     installed version (the service-worker cache version, §10).

Undo acts on the **latest match** (§3) — including a just-completed one, so a
mis-tapped winning game can be undone — and removes its last game. If that op has
**never been sent** (the outbox persists a `sent` flag before the first attempt), it is
removed from the outbox; otherwise — even if the reply was lost — a `deleteGame` is
enqueued. With no games, undo removes the match itself the same way.

## 7. Team proposal

Rules are defined as data in `domain/proposal.js`: each rule has an id, a Norwegian
title, a description and its scoring logic. The About page and the per-proposal
reasons are rendered from these definitions, so documentation cannot drift from code.

**Team sizes** (§18): 4 present → 2 + 2, 5 → 3 + 2, 6 → 3 + 3; with more than 6 the bench
rules choose six, who play 3 + 3 (`TEAM_SIZES` in `domain/proposal.js`, listed on the About
page).

**Step 1 — who plays** (only when roster > 6), applied in order:
1. Fewest matches played tonight play.
2. Tie: most sit-outs this season play.
3. Tie: longest since last played plays.
4. Tie: alphabetical (deterministic).

**Step 2 — split the players.** Score every valid split for the team sizes (4 players: 3
splits, 5 as 3 + 2: 10, 6 as 3 + 3: 10; generated in a fixed order — team A runs through the
name-sorted combinations, and with equal sizes the first name is always on team A so mirror
images are not repeated); lowest wins. A split's teammate pairs are all pairs within each team
(one for a team of two, three for a team of three):
1. Teammate pairs already together tonight — heavy penalty (primary rule: everyone partners everyone).
2. Absolute difference between the team ratings (means, §8) (balance).
3. Times each teammate pair has been together this season — small penalty (variety).

With 4 players over 3 matches, each split occurs once; Elo decides order (most balanced first).

Details:
- Rules are compared lexicographically (rule 1 first; later rules only break ties).
- "Balance" rounds team-rating differences down to the nearest `BALANCE_TOLERANCE` (10)
  points, so near-equal splits fall through to the variety rule.
- The reason shown is the rule on which the chosen option first differs from its closest
  competitor (the next-ranked option that is not a full tie; for the bench: last player in
  vs the benched players in rank order); if all options are equal, the screen says so.
- Matches without games are ignored everywhere in the counting (neither played nor sat
  out); an empty open match is replaced by the next start anyway.

## 8. Elo

- Updated **per game**, chronologically over all games (incomplete matches included).
- Team rating = mean of its players (2 or 3). Expected score
  `E = 1 / (1 + 10^((Rb − Ra) / 400))`. Actual score: win 1, draw ½, loss 0.
- Every team member receives `K × (S − E)` (all three on a 3-player team, though only two
  play each game).
- Constants (in `domain/elo.js`, shown on the About page): start **1000**, **K = 24**,
  provisional for the first **10** games. "Provisional" is a display marker only;
  it does not change K.
- Games are processed in the canonical game order (§3).
- One continuous rating, never reset. Season views show rating at season end and
  the change during the season.

## 9. Statistics

Stats will keep growing, so they are **plugins**: adding a stat must not require
touching widgets or other stats. Adding a stat =
1. one catalog file `domain/stats/catalog/<id>.js`,
2. one import + entry in `domain/stats/registry.js`,
3. its text in `nb.js` (`t.stats[id]`, plus any new `t.statsColumns` / `t.statsLabels`),
4. its id in a page list in `views/stats/pages.js` (compare is automatic for player
   `number` / `wdl` / `chart` stats).
Tests enforce this: the registry contract test checks the shape of every value and that
all its text exists in `nb.js`; the pages test fails for a registered stat shown nowhere.
Ideas are tracked in `design/stats-ideas.md`.

**Facts layer** (`domain/stats/facts.js`): computed once per dataset and filter.
Elo is always replayed over *all* games (ratings are continuous); the season filter
is applied afterwards. Facts contain:
- `rows` — one row per player per game: player, partner, opponents, side, result
  (`W`/`D`/`L`), match, game number, date, season, rating before/after, delta, team
  and opponent team rating before the game.
- `games` — one per game (teams, result, pre-game team ratings).
- `matches` — one per match (teams, games, score, winner, complete).
- `nights` — one per night (roster, matches).
- `players`, plus the full Elo result.
Match-level stats use complete matches only; game-level stats and Elo use all games.

**Subjects** (`domain/stats/subjects.js`): `overall`, `player` (name), `pair` (two
names, sorted), `compare` (two players). Helpers select a subject's rows (a pair's
rows are its games from one partner's perspective) and head-to-head rows.

**Stat plugin** (`domain/stats/catalog/<id>.js`, listed in `domain/stats/registry.js`):
`{ id, subjects: [...], kind, compute(facts, subject) }` returning a value of a known
**kind**, or `null` when there is not enough data:
- `number` — `{ value, format }` (format: `int`, `percent`, `rating`, `decimal`)
- `wdl` — `{ W, D, L }` (D omitted/0 for match records)
- `duel` — `{ left: { name, wins }, right: { name, wins }, draws }` (head-to-head; shown with names in the compare colours)
- `table` — `{ columns: [{ key, format }], rows: [{ …, subject?, provisional? }] }` (rows may
  link to a subject; `provisional: true` marks the row's rating "ny")
- `record` — `{ value, format, holders: [names], date?, matchId? }`
- `chart` — `{ series: [{ name, points: [{ x: date, y }] }] }`
Titles and explanations live in `nb.js` under `t.stats[id]`. An explanation that needs a
domain constant (e.g. minimum games) is a function of one shared params object,
`views/stats/description-params.js` (`{ minGames, provisionalGames, … }`, built from the
exported domain constants); a new constant is added there, never in the widgets.

**Pages are lists of stat ids** (`views/stats/pages.js`): overview, player, pair,
compare. Generic widgets render each kind (`views/stats/widgets/`). Moving a stat
between pages = editing a list.

Each page section has a heading (`t.statsSections`); when a section holds a single stat
whose title equals the heading, the tile title is dropped (the heading stays).

**Compare** reuses the plugins: every `number`/`wdl` stat that supports `player` is
shown side by side for both players; `chart` stats overlay both series (under a neutral
"Over tid" heading; each chart keeps its own title); plus stats with subject `compare`
(record together, record against).

**Season filter**: this season, any earlier season, all time. Applied to the facts,
so stats never deal with seasons. Kept in the URL (`?s=2026-2` / `?s=all`); an explicit
`s` is always respected. Without `s` the default is the current season if it has games,
else the latest season with games, else all time.

**Dates**: records show the full date with year ("14. okt. 2025"); chart axes use the
short form ("14. okt.") when all points fall in one calendar year, the long form otherwise.

**Routes**: `#/stats`, `#/stats/player/<name>`, `#/stats/pairs`,
`#/stats/pair/<a>+<b>`, `#/stats/compare/<a>/<b>` (router supports `:params` and a
query string).

**Starter set**
- Overview: Elo leaderboard (provisional marker, change in the selected season);
  season summary (nights, matches, games, draw %); records: longest match, longest
  draw streak, clean sweeps (3–0 without draws), comebacks (0–2 → 3–2), biggest upset
  (largest pre-game team-rating gap overcome by the game winner).
- Player: Elo over time; games W/D/L and win %; matches W/L and win %; draw rate;
  streaks (current and longest win / unbeaten / loss); partners and opponents tables;
  best partner and nemesis (minimum games apply).
- Pairs: table of all pairs; pair page with W/D/L, win %, head-to-head vs other pairs.
- Compare: the shared player stats side by side, Elo curves overlaid, record together,
  record against.

**Layout**: mobile first — headline numbers and one chart, details one tap deeper;
wide screens add columns (tiles in an auto-fit grid, tables full width). Charts use
Chart.js (§11), loaded only when a chart is shown.

## 10. Sync and error handling

- **Optimistic UI + outbox:** every action is applied locally at once and queued in
  `localStorage`. Input is never lost to network errors.
- **Strictly serial flushing:** one request in flight at a time, in queue order.
  Requests time out after 15 s and count as network errors (retried).
  Triggers: enqueue, `online`, `visibilitychange`, and backoff timer. An unsynced
  badge shows the queue length.
- **Cascade on drop:** when an op is dropped (`conflict` / `invalid`), every later
  queued op that depends on it is dropped too: dropping any op on a `matchId`
  (`startMatch`, `addGame`, `deleteGame`, `deleteMatch`) drops all later ops on that
  `matchId`; dropping a night op drops all later ops for that night date. Player ops
  (`addPlayer`, `renamePlayer`, `setPlayerActive`, `deletePlayer`) belong to no night or
  match: dropping one drops only itself.
  Example: phone 1 started match #2 offline and logged games, but phone 2 had
  already started #2 with other teams → phone 1's `startMatch` and its `addGame`s are
  all dropped, a toast says "Noen andre startet kamp 2", and the app refetches.
- **Optimistic apply is idempotent:** `store.js` applies pending ops on top of a
  refetched dataset with the same natural-key rules as the server, so ops already
  present in fresh data are not duplicated.
- **Wrong PIN:** the outbox is held; the user is prompted for the PIN.
- **Freshness:** full dataset cached locally for instant start; refreshed on open,
  and polled every ~5 s while a match screen is visible. A poll is skipped if the
  previous request is still pending.
- **Service worker (`sw.js`, offline start):** one complete, versioned cache per release,
  `sjineser-<VERSION>`, where `VERSION` is a content hash (SHA-256, 12 hex chars) of every
  shipped file. `PRECACHE` lists every file under `docs/` except `sw.js`, `CNAME`, dotfiles and
  Markdown (vendor licences): `index.html`, the manifest, icons, CSS, `js/theme-init.js`, every
  JS module (sandbox code included) and the vendored Chart.js. Install fetches all of them into
  the new cache, bypassing the HTTP cache (`cache: 'reload'`); if any file fails the install
  fails and the previous version stays. Then `skipWaiting`; activate deletes every other
  `sjineser-*` cache and calls `clients.claim`, so versions are swapped atomically.
  Fetch handles same-origin GETs only: navigations to the app (`./`, `index.html`, any query
  such as `?sandbox`) get the cached `index.html` of the current version (cache-first, so the
  page and its modules always come from the same release; network if missing). Other requests
  are cache-first by exact URL; anything not in the cache goes to the network and is not
  cached. Cross-origin requests (the Apps Script backend) and non-GET requests are never
  intercepted. `js/pwa.js` registers the worker after the window `load` event, on https and on
  localhost/127.0.0.1 only; registration failures are ignored. A release is downloaded when
  the browser next checks `sw.js` and takes effect on the next launch after that.
- **Updates:** the app asks the worker to check for a new version whenever it becomes visible (iOS home-screen apps are usually resumed, not reloaded). When a new version takes over an open page, a toast "Ny versjon er klar — Oppdater" offers a reload. The About/Mer version shows the *downloaded* cache, which can be newer than the running page until that reload.
- **Releasing:** run `npm run stamp` (`scripts/stamp-sw.mjs`) after changing anything in
  `docs/`; it first regenerates `js/about-data.js` (shipped files, lines of JS/CSS/HTML
  without the vendored Chart.js, Apps Script lines, test files and cases), then `PRECACHE`
  and `VERSION` in `sw.js` (over every shipped file, about-data.js included). Enforced by `npm test`, which
  fails while the stamp is stale.

## 11. Visual design

- **Clean first, drill down:** every stats page opens with a few headline numbers and
  at most one chart. Tables, streaks and breakdowns are one tap away (leaderboard row
  → player; pair → pair detail). No page shows everything at once.
- **Restrained palette:** one accent colour plus fixed team A / team B colours used
  consistently on the match screen, in charts and in head-to-heads.
- System font stack, a short type scale, generous whitespace.
- **Design tokens:** all colours, spacing, radii and type sizes are CSS custom
  properties in one file (`css/tokens.css`).
- **Dark and light theme**, chosen on the Mer page: **System** (the default) follows the
  device (`prefers-color-scheme`; dark when unknown) and keeps following it; **Mørk** / **Lys**
  are remembered per device (`localStorage['sjineser:theme']`, shared by real and sandbox
  mode); choosing System again removes the stored value. `js/theme-init.js`, a small classic script loaded synchronously in
  `<head>`, sets `data-theme` on `<html>` before first paint, so the wrong theme never flashes.
- **Header:** the logo and name link to the front page (`#/play`, keeps `?sandbox`), plus the
  sync badge; nothing else. Settings live on the Mer page.
- **Match screen is the exception:** big score and big buttons, readable across the table.
- **Charts: Chart.js** 4.5.1, the UMD build (`chart.umd.min.js`, no dependencies) vendored
  into `docs/vendor/` (no CDN at runtime; works offline), loaded on first use by the wrapper (precached like every other file). Only `views/components/chart.js` imports it; views request
  semantic charts (e.g. "Elo over time") and colours come from the design tokens.
  Swapping libraries touches one file.

## 12. Mobile requirements

- iOS Safari and Android Chrome, both in browser and installed (PWA, standalone).
- Safe-area insets; `dvh` units; tap targets ≥ 44 px; `touch-action: manipulation`
  on buttons; no hover-dependent interaction; works one-handed.
- Installed on iOS the status bar is `black-translucent`: the header extends under it
  (`safe-area-inset-top`); its text is always white, so the light theme paints a dark strip
  exactly the inset's height. Header, main, tab bar, toasts, sheets and the sandbox bar
  respect the left/right insets in landscape. No pull-to-refresh (`overscroll-behavior-y`),
  no long-press callout or text selection on tap targets.
- Responsive up to laptop widths; stats use extra width.

## 13. Testing

- `node --test` suites for all of `domain/` using small hand-built fixture datasets:
  match state, seasons, Elo, proposal rules, every stat.
- Outbox/store logic tested where it is pure.
- Apps Script kept thin; verified manually against the dev sheet.
- Manual checklist for iOS Safari and Android Chrome before each release.

## 14. Deployment

- GitHub repo; GitHub Pages serves branch `main`, folder `/docs` (no Actions needed).
- Custom domain `sjineser.rodland.no`: `docs/CNAME` in the repo, a DNS CNAME record
  `sjineser` → `<github-user>.github.io` at rodland.no, and "Enforce HTTPS" in the
  Pages settings.
- All asset paths, the manifest scope and the service worker scope are relative, so
  the app works both on the custom domain and on `<user>.github.io/<repo>/`.
- Apps Script pushed with `clasp`, deployed as a web app; URL in `js/config.js`.
- Script Properties: `SHEET_ID`, `PIN`.

## 15. Out of scope (first version)

- Import of historical data (separate task once the real sheet is available).
- Editing history in the app (edit the sheet directly).
- Accounts / per-user login.
- Editing a night's roster in the app (late arrivals: edit the sheet).

## 16. Delivery phases

One plan, delivered in phases that each end in something usable:

1. **Backend + sync + play flow** — `setup()`, API, outbox/store, players, nights,
   matches, games, undo. Teams picked manually.
2. **Elo + team proposal** — domain engines, proposal screen, About pages.
3. **Statistics** — overall, player, pairs, compare; Chart.js wrapper.
4. **PWA + polish** — manifest, service worker, mobile checklist.

## 17. Sandbox mode (testing)

Opened with `?sandbox` in the URL (e.g. `https://sjineser.rodland.no/?sandbox#/play`), or with
the **Testmodus** switch on the Mer page (§6), which reloads the current screen with or without
`?sandbox`. The TESTMODUS bar is the indicator that test mode is on.

- **Fake backend** (`js/sandbox/backend.js`) implements the same interface as
  `js/api/client.js` (`getAll`, `post` → envelopes) on top of `domain/dataset.js`
  `applyOp`, persisted in localStorage. Any PIN is accepted. The sheet is never touched.
- **Generated history** (`js/sandbox/generate.js`, seeded PRNG in `js/sandbox/random.js`):
  deterministic for a given seed. Six players with hidden skills; ~16 nights over three
  half-year seasons; rosters of 4–6; 3–4 matches per night; teams chosen by
  `proposeTeams`; game results drawn from hidden skills (≈35 % draws); occasional
  abandoned last match. Built by folding ops through `applyOp`, so it is always valid.
- **Pretend date** (`js/state/clock.js`): `today()` returns the real local date, or in
  sandbox mode a stored pretend date (default: 14 days after the last generated night).
  Actions and views get "today" only from the clock.
- **Separate storage namespace** (`sjineser-sandbox:`), so real outbox/cache/PIN never
  mix with sandbox data.
- **Sandbox bar** under the header: "TESTMODUS" label, date picker for the pretend date,
  "Nullstill" (regenerate data, clear sandbox outbox/cache, reload) and "Avslutt"
  (link to the app without `?sandbox`).

## 18. Teams of 2 or 3 (added 2026-10-16)

The group sometimes plays **3 against 2** (five players). A team has **2 or 3 players**.
On a 3-player team two players play each game and they rotate; the team result is shared,
so all three get the game in their stats and the same Elo change.

- **Sheet:** Matches columns `matchId, date, A1, A2, A3, B1, B2, B3, status` (A3/B3 empty for
  2-player teams). `setup()` creates this layout; the old layout is replaced by wiping test
  data and re-running setup (only development data existed).
- **Validation:** each team has 2–3 distinct, non-empty players; no player on both teams.
- **Elo:** team rating = mean of its players (2 or 3); every team member gets K × (S − E).
  A 3-player team gets no extra advantage.
- **Team sizes for proposals:** 4 → 2+2, 5 → 3+2, 6 → 3+3, 7+ → 3+3 with the bench rules
  choosing six. Split rules (new partners → balance → variety) compare every valid split.
- **Stats:** facts rows carry `partners` (1–2 names) and `opponents` (2–3). Partner tables
  count every teammate. "Pairs" (pairs table, pair page, best partner) mean a 2-player team;
  3-player teams count only per individual. Compare "Sammen" = same team, any size.
- **Import:** `scripts/import-history.mjs` converts the old "Logg" tab (one row per game:
  date, team A 1–3 players, team B 1–3 players, points) into our ops, inferring matches from
  team changes and first-to-3 (same teams with sides swapped = same match), validates them
  with `applyOp`, prints a dry-run summary, and with `--apply` posts them through the API
  (idempotent, PIN required).
