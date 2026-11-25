# Sjineser

Mobile-first web app (Norwegian UI) for recording results of the card game *sjineser* at the table and browsing statistics. Plain HTML/CSS/JS (ES modules, no build) in `docs/`, published with GitHub Pages at https://sjineser.rodland.no. The data lives in Google Sheets behind one Google Apps Script web app (`apps-script/Code.js`). Several independent **leagues** (groups of players) share the app and the script; each has its own sheet and PIN.

## Commands

```bash
npm test            # node --test, Node 22+ (hundreds of tests, must stay green; tests/ mirrors the source tree)
npm run serve       # local server on http://localhost:8000 (serves docs/)
npm run stamp       # REQUIRED after any change under docs/: regenerates docs/sw.js (version, precache) and docs/js/about-data.js; tests fail until you run it
```

Merge conflicts in `docs/sw.js` / `docs/js/about-data.js` are always generated files: `git checkout --theirs` both, then `npm run stamp`.

## The game (what the code models)

- A **set** (sett) is played in **games** (spill); a game is won by team A, team B, or drawn (`A` / `B` / `D`). The first team to **3 game wins** wins the set; draws do not count. A team has **2–3 players** (seats A1–A3 / B1–B3); other players sit out (the bench).
- A **night** (kveld) lists everyone who was there (`players`) and who went home (`left`). It ends at **noon the next day** (`isNightOngoing`). Players can join or leave during the night.
- **Elo** is per game: K=24, the team mean rating, provisional for a player's first 10 games, and a **−10 penalty per missed night** (only for active players after their first night, not while a night is ongoing). Explained to users on `#/about/rating`.
- **Ligatabell** points: 1 per night attended + 2 per set won.
- **Team proposals** (`domain/proposal.js`): bench rules first, then splits ranked by new partners, new opponents, season variety, balance (repeat counts squared for partners/opponents). Explained on `#/about/teams`.
- The spec (`design/specs/…`) and `design/stats-ideas.md` have the details and the reasoning.

## Layout and rules

- `docs/js/domain/` pure logic (match rules, dataset `applyOp`, Elo, team proposals, `stats/**`); `state/` (outbox, store, actions, storage, leagues); `api/client.js`; `views/`; `main.js` composition root; `i18n/nb.js` **all** UI text (no imports); `sandbox/` fake backend for `?sandbox`.
- Owner's taste: clean code, very clear separation of concerns, no CSS/JS in HTML, mobile-first, modern restrained design, JSDoc, comments explain *why*.
- UI terms: **sett** = match in code, **kveld** = night, **spill** = game. UI, README and sheet text are Norwegian; code and comments English.
- Writes are idempotent ops (`applied` / `noop` / `conflict` / `invalid`), queued in an offline outbox. `docs/js/domain/dataset.js` (`applyOp`) mirrors the rules in `apps-script/Code.js` (`HANDLERS`): change both together. One-shot actions that are not queued: `sendNightSummary`, `renameLeague`, `exportBackup`, `restoreBackup`.
- Stats are plugins: one file in `domain/stats/catalog/`, one line in `registry.js`, text in `nb.js`, id in a page list in `views/stats/pages.js`; contract tests enforce it.
- `design/` holds the spec (`specs/2026-10-14-sjineser-design.md`, §19 leagues, §20 backup), plans and `backlog.md`. `docs/` is public: never put specs or plans there.

## Backend (Apps Script)

- Entry points: `doGet` (read a league, no PIN, **never contains email addresses**) and `doPost` (one action from the fixed `HANDLERS` list, needs the league's PIN). Functions run by hand in the editor (`authorize`, `prepareLeagues`, `installBackupTrigger`, `removeBackupTrigger`, `sendBackups`, `setup`, `resetAllData`) are deliberately not reachable from the web.
- Requests: `GET …/exec[?l=<id>]`; `POST` body `{action, payload, pin, league?}` as plain text (no CORS preflight). The main league sends no `league`.
- Script Properties (owner-entered): `LEAGUE_<id>` = `{"name"?,"sheetId","pin"}` (main = `LEAGUE_main`). Script-written bookkeeping: `SCHEMA_<id>`, `SUMMARY_SENDS[_<id>]`. Anything that grants access to a sheet is entered by hand, never through the app.
- Sheet layout is versioned (`SCHEMA_VERSION`): the first request after a bump prepares each league's sheet once under the lock (tabs, headers, formats, validation). Bump it when adding a tab/column. `Settings` tab holds the league `name`.
- **Deploy** (see "Publishing the backend" below): `cd apps-script && clasp push -f && clasp create-deployment -i <deployment id>`, then verify with `curl`: the public GET must not contain `@`, a wrong PIN must answer `pin`. With curl use `-d '<json>'` and `-L` but **not** `-X POST` (it re-POSTs after Google's redirect and fails).
- Adding a league: the owner adds one `LEAGUE_<id>` property (id `[a-z0-9-]{3,40}` with a random part, sheet shared with the script owner's Google account as Editor).
- A new Google permission (e.g. a trigger scope) needs the owner to run `authorize()` once in the editor; the script cannot prompt.

## Publishing the backend (Apps Script, with clasp)

`apps-script/` is a clasp project: `.clasp.json` holds the script id, `.claspignore` limits what is uploaded to `Code.js` and `appsscript.json`. The web app that the app calls is a **deployment** of that script; pushing code does not change what it serves until a new version is deployed to the same deployment.

One-time setup on a machine: `npm i -g @google/clasp` (3.x is installed), `clasp login` in a browser as the script owner's Google account (the token goes to `~/.clasprc.json`, never into the repo), and the Apps Script API switched on at https://script.google.com/home/usersettings.

Every release, from `apps-script/`:
1. `npm test` from the repo root (the backend is tested with fakes in `tests/apps-script/`).
2. `clasp push -f` uploads `Code.js` and `appsscript.json` to the script project (the editor then shows the new code, but the live web app is unchanged).
3. `clasp create-deployment -i <deployment id>` makes a new version and moves the existing deployment to it. The id is the long string in `API_URL` (`docs/js/config.js`, between `/macros/s/` and `/exec`). The URL stays the same, so the app needs no change. It prints `Deployed <id> @<version>`.
4. Verify as described under Deploy above. `clasp deployments` lists the deployments (the live one with its `@version`; `@HEAD` is the editor's own test deployment, ignore it) and `clasp versions` the history.

Rolling back: `clasp create-deployment -i <id>` only moves forward. To go back, check out the old `Code.js` from git and release it again the same way.

If `clasp` says you are not logged in or the token expired, run `clasp login` again. Properties (`LEAGUE_<id>` and so on) are not touched by a deploy. Run `authorize()` in the editor afterwards only if the code now needs a new Google permission.

## Security and privacy (do not weaken)

- Emails live only in the sheet's Players column C and the owner-only backup. Never return them from GET or put them in logs. Inactive players must never receive email. The test send exists only in the main league.
- Never commit a PIN, sheet id or real data. Real import data stays in gitignored `/import/`. Never run `resetAllData()` except to migrate. The script keeps narrow permissions: no full Drive scope (so no renaming or copying spreadsheets).
- This is a personal public repo: commit as the repo's noreply identity, never the owner's work identity or email. Keep addresses, PINs and sheet/script ids out of docs and commits.

## Publishing

Repo `fmmr/sjineser` (personal GitHub account `fmmr`); Pages serves `main` from `/docs`. Push with `git push origin main`; if it is rejected, `gh auth switch --hostname github.com --user fmmr` first. After a push, wait until `https://sjineser.rodland.no/sw.js` shows the new `VERSION` before telling the owner it is live. Use the commit/PR attribution the session tells you to use.

## How we work

- Commit locally as you go. **Push, deploy the backend and publish only when the owner asks** ("merge & deploy", "push it"); an unrequested push of a doc or tweak is not fine on a public repo.
- Gate every release on the tests with `&&` (`node --test | grep -q "fail 0" && …`), never `;`: a failing test must stop a deploy chain.
- Show UI/email changes (a screenshot, or the HTML opened on screen) before publishing them, and verify a deploy on the live system (curl, version check) before saying it is done.
- When explaining rating, stats or rule logic, give a worked numeric example; the owner asks for one if it is missing.
- The owner is a backend developer (Kotlin/Java): explain with the trade-offs and a recommendation, and say what is *not* in the code if it matters.

## Working notes

- macOS: BSD `sed` (use `sed -i ''`, no `\b`), no `shuf` (use `jot`); `npm run serve` needs Python 3.
- Headless Chrome for smoke tests: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=<port> --user-data-dir=<tmp>`, driven with Node's built-in `WebSocket` over the DevTools protocol (no dependencies needed).

- A persisted browser profile keeps the old service worker: delete the profile directory between runs, or you test stale code.
- In `h()` (views/components/dom.js) `false`/`null` children are skipped, but `listGroup` wraps every row in an `<li>`: filter falsy rows yourself.
- iOS: view transitions are off (fixed tab bar bug), the installed home-screen app has its own storage (leagues must be added there too).
- Backend and app work split cleanly (`apps-script/` vs `docs/`): fine to do in parallel in separate worktrees, merging afterwards and re-running `npm run stamp`.

## Status (2026-11-25)

Leagues, per-league names (stored in the sheet's `Settings` tab; `name` in the `LEAGUE_<id>` property is only the seed), backup/restore and the monthly backup email (10th, 06:00, installed by the owner) are live and verified. The main league is called "Jaktlaget". A league for a second group is expected: the owner adds its `LEAGUE_<id>` property himself. Open ideas are in `design/backlog.md`.
