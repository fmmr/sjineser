# Sjineser

Mobile-first web app (Norwegian UI) for recording results of the card game *sjineser* at the table and browsing statistics. Plain HTML/CSS/JS (ES modules, no build) in `docs/`, published with GitHub Pages at https://sjineser.rodland.no. The data lives in Google Sheets behind one Google Apps Script web app (`apps-script/Code.js`). Several independent **leagues** (groups of players) share the app and the script; each has its own sheet and PIN.

## Commands

```bash
npm test            # node --test, Node 22+ (~700 tests, must stay green)
npm run serve       # local server on http://localhost:8000 (serves docs/)
npm run stamp       # REQUIRED after any change under docs/: regenerates docs/sw.js (version, precache) and docs/js/about-data.js; tests fail until you run it
```

Merge conflicts in `docs/sw.js` / `docs/js/about-data.js` are always generated files: `git checkout --theirs` both, then `npm run stamp`.

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
- Deploy: `cd apps-script && clasp push -f && clasp create-deployment -i <deployment id>` (the id is in `API_URL` in `docs/js/config.js`). Then verify with `curl`: the public GET must not contain `@`, a wrong PIN must answer `pin`. With curl use `-d '<json>'` and `-L` but **not** `-X POST` (it re-POSTs after Google's redirect and fails).
- Adding a league: the owner adds one `LEAGUE_<id>` property (id `[a-z0-9-]{3,40}` with a random part, sheet shared with the script owner's Google account as Editor).
- A new Google permission (e.g. a trigger scope) needs the owner to run `authorize()` once in the editor; the script cannot prompt.

## Security and privacy (do not weaken)

- Emails live only in the sheet's Players column C and the owner-only backup. Never return them from GET or put them in logs. Inactive players must never receive email. The test send exists only in the main league.
- Never commit a PIN, sheet id or real data. Real import data stays in gitignored `/import/`. Never run `resetAllData()` except to migrate. The script keeps narrow permissions: no full Drive scope (so no renaming or copying spreadsheets).
- This is a personal public repo: commit as the repo's noreply identity, never the work email (`fmr@finn.no`).

## Publishing

Repo `fmmr/sjineser` (personal GitHub account `fmmr`); Pages serves `main` from `/docs`. Push with `git push origin main`; if it is rejected, `gh auth switch --hostname github.com --user fmmr` first. After a push, wait until `https://sjineser.rodland.no/sw.js` shows the new `VERSION` before telling the owner it is live. Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Working notes

- Browser smoke tests: headless Chrome over CDP against `npm run serve`. A persisted profile keeps the old service worker: delete the profile directory between runs, or you test stale code.
- In `h()` (views/components/dom.js) `false`/`null` children are skipped, but `listGroup` wraps every row in an `<li>`: filter falsy rows yourself.
- iOS: view transitions are off (fixed tab bar bug), the installed home-screen app has its own storage (leagues must be added there too).
- Backend and app work split cleanly (`apps-script/` vs `docs/`): fine to do in parallel in separate worktrees, merging afterwards and re-running `npm run stamp`.
