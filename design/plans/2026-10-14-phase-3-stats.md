# Sjineser Phase 3 — Pluggable Statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A statistics section built from small stat plugins over a shared facts layer: overview, player, pairs, pair and compare pages with a season filter and Chart.js charts. Adding a stat later = one file + one registry line + its text.

**Architecture:** Spec §9 (read it first). `domain/stats/` holds the facts layer, subjects, the plugin registry and the catalog of stats (pure, tested). `views/stats/` holds page definitions (lists of stat ids), generic widgets per value kind, and thin page views. Chart.js 4.5.1 UMD is vendored and lazy-loaded by one wrapper.

**Tech Stack:** Plain JS ES modules, JSDoc, `node --test` (Node 26), Chart.js 4.5.1 (UMD, vendored). No build.

**Existing code to read first:** `docs/js/domain/{match,elo,season,players,dataset}.js`, `docs/js/sandbox/generate.js` (`generateHistory` — realistic test data), `docs/js/router.js`, `docs/js/views/routes.js`, `docs/js/views/stats/stats.js` (placeholder), `docs/js/views/components/dom.js`, `docs/js/i18n/nb.js`, `docs/css/*.css`, `docs/index.html`, `docs/js/main.js` (router ctx: `store, actions, navigate, clock, tapCooldownMs`), `tests/helpers.js`.

**Conventions:** 2-space indent, single quotes, semicolons, JSDoc on exports, no default exports. Domain imports only domain. All user-visible text in `nb.js`. No inline CSS/JS in HTML. Views never import api/sandbox. Mobile first.

---

## Shared definitions (used by several tasks)

**Season filter** — `{ kind: 'all' }` or `{ kind: 'season', year, half }`. URL form: `all` or `2026-2`. Helpers in `domain/stats/filter.js`: `parseFilter(text, today)` (missing/invalid → season of `today`), `formatFilter(filter)`, `inFilter(date, filter)`, `seasonsIn(dataset, today)` (distinct seasons of all nights plus the current one, newest first).

**Facts** — `buildFacts(dataset, filter)` in `domain/stats/facts.js`:

```js
/**
 * @typedef {'W' | 'D' | 'L'} Outcome
 * @typedef {{
 *   player: string, partner: string, opponents: [string, string], side: 'A' | 'B',
 *   outcome: Outcome, matchId: string, gameNo: number, date: string,
 *   ratingBefore: number, ratingAfter: number, delta: number,
 *   teamRating: number, opponentRating: number,
 * }} PlayerGameRow
 * @typedef {{ matchId: string, gameNo: number, date: string, A: [string, string], B: [string, string],
 *   result: 'A' | 'B' | 'D', ratingA: number, ratingB: number }} GameFact     // pre-game team ratings
 * @typedef {{ matchId: string, date: string, A: [string, string], B: [string, string], games: GameFact[],
 *   score: { A: number, B: number, D: number }, winner: 'A' | 'B' | null, complete: boolean }} MatchFact
 * @typedef {{ date: string, players: string[], matches: MatchFact[] }} NightFact
 * @typedef {{ filter: object, rows: PlayerGameRow[], games: GameFact[], matches: MatchFact[],
 *   nights: NightFact[], players: string[], rated: import('../elo.js').Rated }} Facts
 */
```

Rules: Elo is replayed over **all** games with `rateGames` (use `timeline[i].before` / `changes`); then only games/matches/nights whose date is `inFilter` are kept. `rows`, `games`, `matches` in canonical game order (`compareGames`); `matches` only those with ≥ 1 game; `players` = names with ≥ 1 row in scope, sorted with `byName`. Rows: 4 per game. Team ratings = mean of the two players' `before`.

**Subjects** (`domain/stats/subjects.js`):
`{ type: 'overall' }`, `{ type: 'player', name }`, `{ type: 'pair', names: [a, b] }` (sorted with `byName`), `{ type: 'compare', a, b }`.
Helpers: `playerRows(facts, name)`, `pairRows(facts, [a, b])` (rows of `a` where `partner === b`), `togetherRows(facts, a, b)` (= pairRows), `againstRows(facts, a, b)` (rows of `a` where `opponents` includes `b`), `pairKey([a, b])` → `'a+b'` (sorted), `parsePairKey(text)`.

**Stat plugin**:

```js
/**
 * @typedef {'overall' | 'player' | 'pair' | 'compare'} SubjectType
 * @typedef {'number' | 'wdl' | 'table' | 'record' | 'chart'} Kind
 * @typedef {{ id: string, subjects: SubjectType[], kind: Kind,
 *   compute: (facts: Facts, subject: object) => object | null }} Stat
 */
```

Value shapes per kind (validated by `isValidValue(kind, value)` in `domain/stats/kinds.js`):
- `number`: `{ value: number, format: 'int' | 'percent' | 'rating' | 'signed' | 'decimal', marker?: 'provisional' }` (`percent` is 0–1; `signed` shows +/−)
- `wdl`: `{ W: int ≥ 0, D: int ≥ 0, L: int ≥ 0 }`
- `table`: `{ columns: [{ key, format }], rows: [{ [key]: value, subject?: Subject }] }` — formats as `number` plus `'player'` (name, links to player), `'pair'` (`[a, b]`, links to pair), `'label'` (an i18n key under `t.statsLabels`)
- `record`: `{ value: number, format, holders: string[], date?: string, matchId?: string }`
- `chart`: `{ series: [{ name: string, points: [{ x: 'YYYY-MM-DD', y: number }] }] }`

`compute` returns `null` when there is not enough data (widgets show a muted "Ikke nok data").

Constants in `domain/stats/constants.js`: `MIN_GAMES_TOGETHER = 10` (best partner / nemesis).

---

### Task 1: Routes with parameters and query

**Files:** Create `docs/js/routing.js`; Test `tests/routing.test.js`; Modify `docs/js/router.js`, `docs/js/views/routes.js`

- `parseHash(hash)` → `{ path, query }` (`'#/stats/player/Anne?s=2026-2'` → `{ path: '/stats/player/Anne', query: { s: '2026-2' } }`; empty → `{ path: '/', query: {} }`).
- `matchRoute(routes, path)` with `routes` an array of `[pattern, mount]`; patterns like `/stats/player/:name`; returns `{ mount, params }` with `decodeURIComponent`-decoded params, or the `'/'` route as fallback.
- `buildHash(path, query)` → `'#/stats?s=all'` (omit empty query; encode values).
- `router.js`: use these; pass `{ ...ctx, params, query }` to the mount. Keep `navigate(path)`; it may now include a query.
- `routes.js`: convert to an array of `[pattern, mount]` (existing routes unchanged).
- Tests for parse, match (params with spaces/æøå/`+`), fallback, build round-trip.
- Commit `feat(router): route params and query string`.

### Task 2: Filter and facts

**Files:** Create `docs/js/domain/stats/filter.js`, `docs/js/domain/stats/facts.js`; Tests `tests/domain/stats/filter.test.js`, `tests/domain/stats/facts.test.js`

- Implement per the shared definitions.
- Tests (small hand-made datasets from `tests/helpers.js` plus a few with `generateHistory()`):
  - filter parse/format round-trip; invalid → current season; `seasonsIn` order and contents.
  - facts: 4 rows per game; outcomes per side (A win → A players `W`, B players `L`; draw → all `D`); partner/opponents correct; `ratingAfter - ratingBefore === delta`; ratings continue across seasons (a row in the second season has `ratingBefore` equal to the player's last `ratingAfter` in the first); filter removes out-of-scope rows/games/matches/nights but ratings are unaffected; `matches` excludes matches without games; `complete`/`winner`/`score` correct incl. abandoned; canonical order.
- Commit `feat(stats): season filter and facts layer`.

### Task 3: Subjects, kinds, registry, contract test

**Files:** Create `docs/js/domain/stats/subjects.js`, `docs/js/domain/stats/kinds.js`, `docs/js/domain/stats/constants.js`, `docs/js/domain/stats/registry.js`, `docs/js/domain/stats/catalog/` (empty for now except what Task 4 adds); Tests `tests/domain/stats/subjects.test.js`, `tests/domain/stats/kinds.test.js`, `tests/domain/stats/registry.test.js`

- `registry.js` exports `STATS` (array of plugins, imported from `catalog/*.js`), `statById(id)`, `statsFor(subjectType, kinds?)`.
- **Contract test** (`registry.test.js`) — the safety net for every future stat:
  - ids unique; every `subjects` entry is a known type; every `kind` known;
  - every id has `t.stats[id].title` in `nb.js`;
  - for every stat and every subject type it supports, compute on `buildFacts(generateHistory().dataset, filter)` for both `{ kind: 'all' }` and the latest season, with representative subjects (overall; the top-rated player; that player's most frequent pair; compare top vs bottom player): result is `null` or `isValidValue(kind, value)`; at least one of the two filters gives non-null for each stat.
- Commit `feat(stats): subjects, value kinds, registry and contract test`.

### Task 4: Overview stats

**Files:** `docs/js/domain/stats/catalog/{leaderboard,nightsCount,matchesCount,gamesCount,drawRate,longestMatch,longestDrawStreak,cleanSweeps,comebacks,biggestUpset}.js`; register them; Tests `tests/domain/stats/catalog/overview.test.js` (hand-made fixtures with known answers)

Definitions:
- `leaderboard` (overall, table): one row per player in scope. `rating` = their last `ratingAfter` in scope; `change` = that minus their first `ratingBefore` in scope (format `signed`); `games` = rows in scope; `provisional` = total games (all time up to their last row in scope) < `ELO.PROVISIONAL_GAMES` (render as marker); sorted by rating desc; columns `rank`(int), `player`(player), `rating`(rating), `change`(signed), `games`(int). Row `subject` = player.
- `nightsCount`, `matchesCount`, `gamesCount` (overall, number int): nights with ≥ 1 match with games / matches with games / games.
- `drawRate` (overall, player, pair; number percent): draws / games for the subject (overall: games; player/pair: their rows). `null` if 0 games.
- `longestMatch` (overall, record int): match with most games; tie → most recent; holders = winners if complete else all four; `date`, `matchId`.
- `longestDrawStreak` (overall, record int): longest run of consecutive draws within one night (canonical order; resets between nights); tie → most recent; holders `[]`; `date`.
- `cleanSweeps` (overall, record int): count of complete matches won 3–0 with no draws; holders/date = most recent sweep's winners; `null` if none.
- `comebacks` (overall, record int): count of complete matches where the winner trailed 0–2 in wins and won 3–2; holders/date = most recent; `null` if none.
- `biggestUpset` (overall, record rating): the game where the winning team's pre-game rating was lowest relative to the losers (`gap = loser − winner > 0`), max gap; tie → most recent; holders = winners; `date`, `matchId`; `null` if no upset.
- Update `design/stats-ideas.md` ticks when done.
- Commit `feat(stats): overview stats`.

### Task 5: Player, pair and compare stats

**Files:** `docs/js/domain/stats/catalog/{rating,eloChart,gamesWdl,gameWinRate,matchesWdl,matchWinRate,streaks,partners,opponents,bestPartner,nemesis,pairsTable,pairVsPairs,togetherWdl,againstWdl}.js`; register; Tests `tests/domain/stats/catalog/player.test.js`, `.../pair.test.js`, `.../compare.test.js`

Definitions (subject rows = `playerRows` or `pairRows`):
- `rating` (player; number rating, `marker: 'provisional'` when provisional): last `ratingAfter` in scope.
- `eloChart` (player; chart): one point per night the player played in scope: `{ x: night date, y: ratingAfter of their last game that night }`; series name = player.
- `gamesWdl` (player, pair; wdl): counts of outcomes.
- `gameWinRate` (player, pair; number percent): W / games.
- `matchesWdl` (player, pair; wdl with D = 0): complete matches in scope involving the subject (pair: as partners), won vs lost.
- `matchWinRate` (player, pair; number percent): matches won / complete matches; `null` if none.
- `streaks` (player; table): rows for `win` (W), `unbeaten` (W or D), `loss` (L) with `current` and `longest` (int) over the player's rows in scope; first column key `kind` with format `label` (i18n `t.statsLabels.streak_win` etc.).
- `partners` (player; table): per partner: `partner`(player), `games`, `W`, `D`, `L`, `winRate`(percent); sorted by games desc; row subject = pair.
- `opponents` (player; table): per individual opponent, same columns with `opponent`(player); row subject = compare (player vs opponent).
- `bestPartner` (player; record percent): partner with highest W/games among partners with ≥ `MIN_GAMES_TOGETHER` games; tie → more games; holders `[partner]`; `null` if none qualifies.
- `nemesis` (player; record percent): opponent with lowest player W/games among opponents faced in ≥ `MIN_GAMES_TOGETHER` games; tie → more games; holders `[opponent]`; `null` if none.
- `pairsTable` (overall; table): every pair with ≥ 1 game in scope: `pair`(pair), `games`, `W`, `D`, `L`, `winRate`; sorted by games desc; row subject = pair.
- `pairVsPairs` (pair; table): per opposing pair: `pair`(pair), `games`, `W`, `D`, `L`, `winRate` from the subject pair's perspective; sorted by games desc.
- `togetherWdl` (compare; wdl): games where a and b were partners.
- `againstWdl` (compare; wdl): games where a played against b, from a's perspective.
- Commit `feat(stats): player, pair and compare stats`.

### Task 6: Chart.js and widgets

**Files:** Create `docs/vendor/chart.js/4.5.1/chart.umd.min.js` (download `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` into a fresh temp dir, check it starts with the Chart.js license banner and contains `4.5.1`, then copy), `docs/vendor/chart.js/4.5.1/LICENSE.md` (MIT text from the package), `docs/js/views/components/chart.js`, `docs/js/views/stats/widgets/{index,number,wdl,table,record,chart}.js`, `docs/css/views/stats.css` (+ link in `index.html`)

- `components/chart.js` — the only code that knows Chart.js:
  - `loadChartLibrary()` injects `<script src="vendor/chart.js/4.5.1/chart.umd.min.js">` once (memoized promise; resolves `globalThis.Chart`).
  - `renderLineChart(container, { series })` → `{ destroy() }`: union of all x dates sorted as category labels; one dataset per series (`spanGaps: true`, no point dots on dense series); colours from CSS custom properties (`--team-a`, `--team-b`, `--accent`, `--text-muted`, `--border`) read via `getComputedStyle`; `responsive: true`, `maintainAspectRatio: false` (container sets height); legend only when > 1 series; tooltips enabled (touch-friendly default `mode: 'index', intersect: false`).
- Widgets: `renderWidget(stat, value, ctx)` dispatches by `stat.kind`, returns `{ el, destroy? }`; each widget shows `t.stats[id].title` and, when `value === null`, `t.statsUi.noData`.
  - `number`: big value formatted by `format` (shared `formatValue(value, format)` in `widgets/format.js`; Norwegian number formatting via `Intl.NumberFormat('nb-NO')`; percent with 0 decimals; `signed` with +/−; marker → `t.ratingLabel`-style "ny").
  - `wdl`: three numbers W/U/T plus a thin stacked bar (CSS widths via a `style` property set from JS on the element — allowed: `el.style.setProperty('--share', …)`).
  - `table`: `<table>` with headers from `t.statsColumns[key]`; cells formatted; `player`/`pair` cells and rows with `subject` link to the subject route (build hashes with `buildHash`, keep the current `s` query); horizontally scrollable wrapper on narrow screens.
  - `record`: value + holders (joined with `t.and`) + formatted date (`formatDate`).
  - `chart`: a fixed-height container (`.stat-chart`, 220 px mobile / 280 px wide) and `renderLineChart`.
- Commit `feat(stats): Chart.js wrapper and value widgets`.

### Task 7: Pages and views

**Files:** Create `docs/js/views/stats/pages.js`, `docs/js/views/stats/render-page.js`, `docs/js/views/stats/season-filter.js`, `docs/js/views/stats/{overview,player,pairs,pair,compare}.js`; Modify `docs/js/views/routes.js` (replace the placeholder `stats.js`, delete it), `docs/js/views/shell.js` (active tab for `/stats/*` already works), `docs/js/i18n/nb.js`

- `pages.js` — page definitions as data:

```js
export const PAGES = {
  overview: { sections: [
    { id: 'leaderboard', stats: ['leaderboard'] },
    { id: 'summary', stats: ['nightsCount', 'matchesCount', 'gamesCount', 'drawRate'] },
    { id: 'records', stats: ['longestMatch', 'longestDrawStreak', 'cleanSweeps', 'comebacks', 'biggestUpset'] },
  ] },
  player: { sections: [
    { id: 'rating', stats: ['rating', 'eloChart'] },
    { id: 'results', stats: ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate'] },
    { id: 'streaks', stats: ['streaks'] },
    { id: 'people', stats: ['bestPartner', 'nemesis', 'partners', 'opponents'] },
  ] },
  pairs: { sections: [{ id: 'pairs', stats: ['pairsTable'] }] },
  pair: { sections: [
    { id: 'results', stats: ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate'] },
    { id: 'versus', stats: ['pairVsPairs'] },
  ] },
};
// Compare is derived, not listed: every number/wdl stat supporting 'player' side by side,
// every chart stat supporting 'player' overlaid, then all stats with subject 'compare'.
```

- `render-page.js`: `renderPage(root, page, facts, subject, ctx)` → sections (`<section>` with `t.statsSections[id]` heading) of widgets in an auto-fit grid; tables and charts span full width; returns `{ destroy }` (destroys charts).
- `season-filter.js`: a `<select>` with "Denne sesongen" (current), each season from `seasonsIn` (`t.statsUi.season({ year, half })` → "Høst 2026" / "Vår 2026"), and "Alle sesonger"; change → `navigate(buildHash(path, { ...query, s }))`.
- Facts memo: in each view, `buildFacts` is recomputed only when `store.get()` identity or the filter text changes (small memo in `render-page.js` or a `views/stats/facts-cache.js`).
- `overview.js` (`#/stats`): filter, links to `#/stats/pairs`, `PAGES.overview`.
- `player.js` (`#/stats/player/:name`): heading = name, filter, "Sammenlign med …" select (other players in scope) → compare route, `PAGES.player`. Unknown name → muted not-found text.
- `pairs.js`, `pair.js` (`#/stats/pair/:pair` with `a+b`), `compare.js` (`#/stats/compare/:a/:b`): compare renders two-column rows for derived number/wdl stats (`a` left, `b` right, team colours), overlaid charts (both series), then compare stats.
- Keep the about link (`#/about/rating`) on the overview.
- `nb.js`: `t.stats[id] = { title, description? }` for every stat; `t.statsSections`, `t.statsColumns` (`rank`, `player`, `rating`, `change`, `games`, `partner`, `opponent`, `pair`, `W` "S", `D` "U", `L` "T", `winRate` "Seier %", `kind`, `current` "Nå", `longest` "Lengst"), `t.statsLabels` (`streak_win` "Seire", `streak_unbeaten` "Ubeseiret", `streak_loss` "Tap"), `t.statsUi` (`noData` "Ikke nok data", `thisSeason`, `allSeasons` "Alle sesonger", `season`, `pairsLink` "Alle par", `compareWith` "Sammenlign med …", `notFound`, `provisional` "ny").
- CSS (`stats.css`): `.stat-grid` (auto-fit `minmax(150px, 1fr)`), `.stat-tile`, `.stat-wide` (grid-column: 1 / -1), tables (`.stat-table`, sticky header, scroll wrapper, tabular numbers), wdl bar, compare rows; wide screens (`min-width: 900px`): `--content-width` for stats pages widened (e.g. a `.stats-page` wrapper with `max-width: 1100px`) and sections may sit in two columns.
- Commit `feat(stats): pages, season filter and stats views`.

### Task 8: Controller verification and release

- Headless (sandbox): overview, player, pairs, pair, compare at 375 px and 1280 px, dark and light; season filter changes values; links between pages work; charts render; no console errors.
- Code review of the phase; fix findings; tick `design/stats-ideas.md`; push as `fmmr`.
