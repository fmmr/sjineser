# Sjineser Phase 2 — Elo and Team Proposals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ratings per player (Elo, per game) and automatic team proposals with sit-out rotation on the new-match screen, plus two explanation pages generated from the same rule and constant definitions.

**Architecture:** Three new pure domain modules (`season.js`, `elo.js`, `proposal.js`) with tests. The new-match view prefills the proposal and shows its reasons; two about views render rules and Elo constants. All text in `docs/js/i18n/nb.js`. Spec: `design/specs/2026-10-14-sjineser-design.md` §7–8.

**Tech Stack:** Plain JS ES modules, JSDoc, Node 26 `node --test`. No new dependencies.

**Existing code you build on** (read before starting):
- `docs/js/domain/match.js` — `compareGames`, `teamOf(match, 'A'|'B')`, `SEATS`, `currentNight`, `currentMatch`, `gamesOf`, `matchesOfNight`, `makeMatchId`.
- `docs/js/domain/players.js` — `byName` (Norwegian collation).
- `tests/helpers.js` — `dataset()`, `game(matchId, gameNo, result)`, `DATE`, `FOUR`.
- `docs/js/views/play/new-match.js` — manual team assignment (`sides` Map, `cycle`, `starting` guard).
- `docs/js/views/components/dom.js` — `h(tag, props, ...children)`.

Conventions: 2-space indent, single quotes, semicolons, JSDoc on exports, no default exports, domain imports only domain.

---

### Task 1: Seasons

**Files:**
- Create: `docs/js/domain/season.js`
- Test: `tests/domain/season.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inSeason, seasonOf } from '../../docs/js/domain/season.js';

test('seasons are half-years: January–June and July–December', () => {
  assert.deepEqual(seasonOf('2026-01-01'), { year: 2026, half: 1 });
  assert.deepEqual(seasonOf('2026-06-30'), { year: 2026, half: 1 });
  assert.deepEqual(seasonOf('2026-07-01'), { year: 2026, half: 2 });
  assert.deepEqual(seasonOf('2026-12-31'), { year: 2026, half: 2 });
});

test('inSeason compares year and half', () => {
  const autumn = seasonOf('2026-10-14');
  assert.equal(inSeason('2026-08-01', autumn), true);
  assert.equal(inSeason('2026-05-01', autumn), false);
  assert.equal(inSeason('2025-10-14', autumn), false);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL, module not found.

- [ ] **Step 3: Implement `docs/js/domain/season.js`**

```js
/** @typedef {{ year: number, half: 1 | 2 }} Season half 1 = January–June, half 2 = July–December */

/** @param {string} date YYYY-MM-DD @returns {Season} */
export function seasonOf(date) {
  const [year, month] = date.split('-').map(Number);
  return { year, half: month <= 6 ? 1 : 2 };
}

/** @param {string} date @param {Season} season */
export function inSeason(date, season) {
  const other = seasonOf(date);
  return other.year === season.year && other.half === season.half;
}
```

- [ ] **Step 4: Run tests** — `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/domain/season.js tests/domain/season.test.js
git commit -m "feat(domain): half-year seasons"
```

---

### Task 2: Elo ratings

**Files:**
- Create: `docs/js/domain/elo.js`
- Test: `tests/domain/elo.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELO, expectedScore, isProvisional, rateGames, ratingOf } from '../../docs/js/domain/elo.js';
import { DATE, dataset, game } from '../helpers.js';

const M1 = `${DATE}#1`;
const withGames = (results) => dataset({
  matches: [{ matchId: M1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' }],
  games: results.map((r, i) => game(M1, i + 1, r)),
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('expectedScore follows the Elo curve', () => {
  close(expectedScore(1000, 1000), 0.5);
  close(expectedScore(1000 + ELO.SCALE, 1000), 10 / 11);
});

test('everyone starts at START and unknown players are provisional', () => {
  const rated = rateGames(dataset());
  assert.equal(ratingOf(rated, 'Nobody'), ELO.START);
  assert.equal(isProvisional(rated, 'Nobody'), true);
});

test('a win between equal teams moves each player K/2', () => {
  const rated = rateGames(withGames(['A']));
  close(ratingOf(rated, 'Hans'), ELO.START + ELO.K / 2);
  close(ratingOf(rated, 'Frode'), ELO.START + ELO.K / 2);
  close(ratingOf(rated, 'Tor'), ELO.START - ELO.K / 2);
});

test('a draw between equal teams changes nothing; partners always change equally', () => {
  const rated = rateGames(withGames(['D']));
  close(ratingOf(rated, 'Hans'), ELO.START);
  const after = rateGames(withGames(['A', 'B']));
  const a = ELO.START + ELO.K / 2;
  const b = ELO.START - ELO.K / 2;
  close(ratingOf(after, 'Hans'), a - ELO.K * expectedScore(a, b));
  close(ratingOf(after, 'Hans'), ratingOf(after, 'Frode'));
  close(ratingOf(after, 'Tor'), b + ELO.K * expectedScore(a, b));
});

test('games are replayed in canonical order regardless of input order', () => {
  const ordered = withGames(['A', 'B', 'D']);
  const shuffled = { ...ordered, games: [...ordered.games].reverse() };
  close(ratingOf(rateGames(shuffled), 'Hans'), ratingOf(rateGames(ordered), 'Hans'));
});

test('games played and provisional status are tracked per player', () => {
  const rated = rateGames(withGames(Array(ELO.PROVISIONAL_GAMES).fill('D')));
  assert.equal(rated.gamesPlayed.get('Per'), ELO.PROVISIONAL_GAMES);
  assert.equal(isProvisional(rated, 'Per'), false);
  assert.equal(isProvisional(rateGames(withGames(['D'])), 'Per'), true);
});

test('timeline records each game with every player change; games of unknown matches are skipped', () => {
  const ds = withGames(['A']);
  ds.games.push(game(`${DATE}#9`, 1, 'A'));
  const { timeline } = rateGames(ds);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].game.matchId, M1);
  close(timeline[0].changes.get('Per'), -ELO.K / 2);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL, module not found.

- [ ] **Step 3: Implement `docs/js/domain/elo.js`**

```js
import { compareGames, teamOf } from './match.js';

/** Rating constants. The "how ratings work" page shows these, so change them only here. */
export const ELO = Object.freeze({ START: 1000, K: 24, SCALE: 400, PROVISIONAL_GAMES: 10 });

const ACTUAL_SCORE = { A: 1, D: 0.5, B: 0 };

/** Expected score (0–1) of a team rated `rating` against a team rated `opponent`. */
export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / ELO.SCALE));

/**
 * @typedef {{
 *   ratings: Map<string, number>,
 *   gamesPlayed: Map<string, number>,
 *   timeline: { game: import('./match.js').Game, changes: Map<string, number> }[],
 * }} Rated
 */

/**
 * Replays every game in canonical order. A team's rating is the mean of its players;
 * both partners receive K × (actual − expected). Games of unknown matches are skipped.
 * @param {import('./match.js').Dataset} dataset
 * @returns {Rated}
 */
export function rateGames(dataset) {
  const matches = new Map(dataset.matches.map((m) => [m.matchId, m]));
  const ratings = new Map();
  const gamesPlayed = new Map();
  const timeline = [];
  const rating = (name) => ratings.get(name) ?? ELO.START;
  const teamRating = ([first, second]) => (rating(first) + rating(second)) / 2;

  for (const game of [...dataset.games].sort(compareGames)) {
    const match = matches.get(game.matchId);
    if (!match) continue;
    const teamA = teamOf(match, 'A');
    const teamB = teamOf(match, 'B');
    const delta = ELO.K * (ACTUAL_SCORE[game.result] - expectedScore(teamRating(teamA), teamRating(teamB)));
    const changes = new Map([...teamA.map((name) => [name, delta]), ...teamB.map((name) => [name, -delta])]);
    for (const [name, change] of changes) {
      ratings.set(name, rating(name) + change);
      gamesPlayed.set(name, (gamesPlayed.get(name) ?? 0) + 1);
    }
    timeline.push({ game, changes });
  }
  return { ratings, gamesPlayed, timeline };
}

/** @param {Rated} rated @param {string} name */
export const ratingOf = (rated, name) => rated.ratings.get(name) ?? ELO.START;

/** Display marker only; it does not change K. @param {Rated} rated @param {string} name */
export const isProvisional = (rated, name) => (rated.gamesPlayed.get(name) ?? 0) < ELO.PROVISIONAL_GAMES;
```

- [ ] **Step 4: Run tests** — `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/domain/elo.js tests/domain/elo.test.js
git commit -m "feat(domain): per-game Elo ratings with timeline"
```

---

### Task 3: Team proposals

Rules are data: each has an `id` (its text lives in `t.rules[id]`) and a `key` function; lower keys are better, and candidates are compared rule by rule (lexicographically). The reason shown to users is the most important rule that made a difference.

**Files:**
- Create: `docs/js/domain/proposal.js`
- Test: `tests/domain/proposal.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_RULES, SPLIT_RULES, proposeTeams } from '../../docs/js/domain/proposal.js';
import { rateGames } from '../../docs/js/domain/elo.js';
import { makeMatchId } from '../../docs/js/domain/match.js';
import { DATE, FOUR, dataset, game } from '../helpers.js';

const FIVE = ['Anne', 'Frode', 'Hans', 'Per', 'Tor'];
const night = (players, date = DATE) => ({ date, players });
const match = (number, [A1, A2], [B1, B2], date = DATE) => ({ matchId: makeMatchId(date, number), date, A1, A2, B1, B2 });
/** A complete match (team A wins 3–0) so it is not treated as the open match. */
const played = (m) => [m, [1, 2, 3].map((n) => game(m.matchId, n, 'A'))];

function build(nights, entries = []) {
  return dataset({
    nights,
    matches: entries.map(([m]) => m),
    games: entries.flatMap(([, games]) => games),
  });
}
const propose = (ds) => proposeTeams(ds, rateGames(ds));
const pairKeys = (p) => [p.A.join('+'), p.B.join('+')];

test('rule ids are unique and ordered as documented', () => {
  assert.deepEqual(BENCH_RULES.map((r) => r.id), ['fewestTonight', 'mostSitOutsSeason', 'longestSinceLastPlayed', 'alphabetical']);
  assert.deepEqual(SPLIT_RULES.map((r) => r.id), ['newPartners', 'balance', 'seasonVariety']);
});

test('no night or fewer than four players gives no proposal', () => {
  assert.equal(propose(dataset()), null);
  assert.equal(propose(build([night(FOUR.slice(0, 3))])), null);
});

test('four fresh players: first split in name order, nobody benched, no deciding rule', () => {
  assert.deepEqual(propose(build([night(FOUR)])), { A: ['Frode', 'Hans'], B: ['Per', 'Tor'], bench: [], benchRule: null, splitRule: null });
});

test('three matches with four players pair everyone with everyone', () => {
  let entries = [];
  const seen = new Set();
  for (let n = 1; n <= 3; n += 1) {
    const p = propose(build([night(FOUR)], entries));
    pairKeys(p).forEach((key) => seen.add(key));
    if (n > 1) assert.equal(p.splitRule, 'newPartners');
    entries = [...entries, played(match(n, p.A, p.B))];
  }
  assert.equal(seen.size, 6);
});

test('balance picks the most even split; small differences count as equal', () => {
  const ds = build([night(FOUR)]);
  const rated = { ratings: new Map([['Hans', 1100], ['Frode', 1080]]), gamesPlayed: new Map(), timeline: [] };
  const p = proposeTeams(ds, rated);
  assert.deepEqual([p.A, p.B], [['Frode', 'Per'], ['Hans', 'Tor']]);
  assert.equal(p.splitRule, 'balance');
});

test('five fresh players: the last name alphabetically sits out', () => {
  const p = propose(build([night(FIVE)]));
  assert.deepEqual(p.bench, ['Tor']);
  assert.equal(p.benchRule, 'alphabetical');
});

test('whoever sat out plays next', () => {
  const p = propose(build([night(FIVE)], [played(match(1, ['Anne', 'Frode'], ['Hans', 'Per']))]));
  assert.ok([...p.A, ...p.B].includes('Tor'));
  assert.deepEqual(p.bench, ['Per']);
});

test('earlier sit-outs this season give priority; last season does not count', () => {
  const earlier = (date) => build(
    [night(FIVE, date), night(FIVE)],
    [played(match(1, ['Anne', 'Frode'], ['Hans', 'Per'], date))],
  );
  const thisSeason = propose(earlier('2026-09-01'));
  assert.ok([...thisSeason.A, ...thisSeason.B].includes('Tor'));
  assert.deepEqual(thisSeason.bench, ['Per']);
  assert.equal(propose(earlier('2026-05-01')).bench[0], 'Tor');
});

test('on equal counts, whoever waited longest tonight plays', () => {
  const SIX = ['Anne', 'Bjørn', 'Cato', 'Dag', 'Erik', 'Finn'];
  const p = propose(build([night(SIX)], [
    played(match(1, ['Anne', 'Bjørn'], ['Erik', 'Finn'])),
    played(match(2, ['Cato', 'Dag'], ['Erik', 'Finn'])),
    played(match(3, ['Anne', 'Bjørn'], ['Cato', 'Dag'])),
  ]));
  assert.deepEqual(p.bench, ['Cato', 'Dag']);
});

test('an empty open match is ignored, since starting the next one replaces it', () => {
  const ds = build([night(FOUR)], [[match(1, ['Frode', 'Hans'], ['Per', 'Tor']), []]]);
  assert.deepEqual(pairKeys(propose(ds)), ['Frode+Hans', 'Per+Tor']);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL, module not found.

- [ ] **Step 3: Implement `docs/js/domain/proposal.js`**

```js
import { ratingOf } from './elo.js';
import { SEATS, currentMatch, currentNight, gamesOf, matchesOfNight, teamOf } from './match.js';
import { byName } from './players.js';
import { inSeason, seasonOf } from './season.js';

const PLAYERS_PER_MATCH = 4;

/** Team rating differences within this many points count as equally balanced. */
export const BALANCE_TOLERANCE = 10;

/**
 * Who plays (only when more than four are present). Rules in priority order; for each player
 * a rule returns a key, lower plays first. Text for each id is in t.rules.
 */
export const BENCH_RULES = [
  { id: 'fewestTonight', key: (name, ctx) => ctx.matchesTonight(name) },
  { id: 'mostSitOutsSeason', key: (name, ctx) => -ctx.sitOutsThisSeason(name) },
  { id: 'longestSinceLastPlayed', key: (name, ctx) => ctx.lastPlayedTonight(name) },
  { id: 'alphabetical', key: (name, ctx) => ctx.alphabeticalIndex(name) },
];

/** How the four players are split into teams. Lower keys win, compared rule by rule. */
export const SPLIT_RULES = [
  { id: 'newPartners', key: (split, ctx) => sum(split.pairs.map(ctx.partneredTonight)) },
  { id: 'balance', key: (split, ctx) => Math.floor(Math.abs(ctx.teamRating(split.A) - ctx.teamRating(split.B)) / BALANCE_TOLERANCE) },
  { id: 'seasonVariety', key: (split, ctx) => sum(split.pairs.map(ctx.partneredThisSeason)) },
];

/**
 * @typedef {{ A: string[], B: string[], bench: string[], benchRule: string | null, splitRule: string | null }} Proposal
 * benchRule/splitRule: id of the most important rule that decided, or null if all options were equal.
 */

/**
 * Proposes teams for the next match of the current night.
 * @param {import('./match.js').Dataset} dataset
 * @param {import('./elo.js').Rated} rated
 * @returns {Proposal | null}
 */
export function proposeTeams(dataset, rated) {
  const night = currentNight(dataset);
  if (!night || night.players.length < PLAYERS_PER_MATCH) return null;
  const ctx = buildContext(withoutEmptyOpenMatch(dataset), night, rated);

  const players = rank(night.players, BENCH_RULES, ctx);
  const playing = players.slice(0, PLAYERS_PER_MATCH);
  const benched = players.slice(PLAYERS_PER_MATCH);
  const splits = rank(splitsOf(playing.map((p) => p.item).sort(byName)), SPLIT_RULES, ctx);
  const [chosen, ...others] = splits;

  return {
    A: chosen.item.A,
    B: chosen.item.B,
    bench: benched.map((p) => p.item).sort(byName),
    benchRule: benched.length ? decidingRule(BENCH_RULES, playing.at(-1), benched) : null,
    splitRule: decidingRule(SPLIT_RULES, chosen, others),
  };
}

const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);
const pairKey = (pair) => [...pair].sort(byName).join('+');
const seated = (match) => SEATS.map((seat) => match[seat]);

function compareKeys(x, y) {
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Items sorted best first by rule keys; the sort is stable, so ties keep input order. */
function rank(items, rules, ctx) {
  return items
    .map((item) => ({ item, keys: rules.map((rule) => rule.key(item, ctx)) }))
    .sort((x, y) => compareKeys(x.keys, y.keys));
}

/** The most important rule on which `chosen` differs from at least one of `others`. */
function decidingRule(rules, chosen, others) {
  const indexes = others
    .map((other) => chosen.keys.findIndex((key, i) => key !== other.keys[i]))
    .filter((i) => i !== -1);
  return indexes.length ? rules[Math.min(...indexes)].id : null;
}

/** The three ways to split four players (sorted by name) into two teams. */
function splitsOf([p0, p1, p2, p3]) {
  return [[[p0, p1], [p2, p3]], [[p0, p2], [p1, p3]], [[p0, p3], [p1, p2]]]
    .map(([A, B]) => ({ A, B, pairs: [A, B] }));
}

/** An open match without games will be replaced by the next start, so it must not count. */
function withoutEmptyOpenMatch(dataset) {
  const open = currentMatch(dataset);
  if (!open || gamesOf(dataset, open.matchId).length > 0) return dataset;
  return { ...dataset, matches: dataset.matches.filter((m) => m.matchId !== open.matchId) };
}

function countPairs(matches) {
  const counts = new Map();
  for (const match of matches) {
    for (const pair of [teamOf(match, 'A'), teamOf(match, 'B')]) {
      counts.set(pairKey(pair), (counts.get(pairKey(pair)) ?? 0) + 1);
    }
  }
  return counts;
}

function buildContext(dataset, night, rated) {
  const tonight = matchesOfNight(dataset, night.date);
  const season = seasonOf(night.date);
  const seasonNights = dataset.nights.filter((n) => inSeason(n.date, season));
  const tonightPairs = countPairs(tonight);
  const seasonPairs = countPairs(dataset.matches.filter((m) => inSeason(m.date, season)));
  const roster = [...night.players].sort(byName);

  return {
    matchesTonight: (name) => tonight.filter((m) => seated(m).includes(name)).length,
    sitOutsThisSeason: (name) => sum(seasonNights
      .filter((n) => n.players.includes(name))
      .map((n) => matchesOfNight(dataset, n.date).filter((m) => !seated(m).includes(name)).length)),
    lastPlayedTonight: (name) => tonight.findLastIndex((m) => seated(m).includes(name)),
    alphabeticalIndex: (name) => roster.indexOf(name),
    partneredTonight: (pair) => tonightPairs.get(pairKey(pair)) ?? 0,
    partneredThisSeason: (pair) => seasonPairs.get(pairKey(pair)) ?? 0,
    teamRating: ([first, second]) => (ratingOf(rated, first) + ratingOf(rated, second)) / 2,
  };
}
```

- [ ] **Step 4: Run tests** — `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/js/domain/proposal.js tests/domain/proposal.test.js
git commit -m "feat(domain): team proposals with rules as data"
```

---

### Task 4: Text, explanation pages and routes

**Files:**
- Modify: `docs/js/i18n/nb.js`, `docs/js/views/routes.js`, `docs/js/views/stats/stats.js`, `docs/index.html`, `docs/css/base.css`, `docs/css/components.css`
- Create: `docs/js/views/about/teams.js`, `docs/js/views/about/rating.js`, `docs/css/views/about.css`

- [ ] **Step 1: Add to `t` in `docs/js/i18n/nb.js`** (insert before `statsComingSoon`):

```js
  proposal: {
    bench: (names, rule) => `Står over: ${names} (${rule.toLowerCase()})`,
    split: (rule) => `Lagforslag: ${rule.toLowerCase()}`,
    splitTie: 'Lagforslag: alle oppsett er like gode',
    useProposal: 'Bruk forslaget',
  },
  provisional: 'ny',

  rules: {
    fewestTonight: { title: 'Færrest kamper i kveld', description: 'De som har spilt færrest kamper i kveld, spiller først.' },
    mostSitOutsSeason: { title: 'Flest ganger på benken', description: 'Ved likhet spiller de som har stått over flest kamper denne sesongen.' },
    longestSinceLastPlayed: { title: 'Lengst siden sist', description: 'Ved likhet spiller de som har ventet lengst siden forrige kamp i kveld.' },
    alphabetical: { title: 'Alfabetisk', description: 'Til slutt avgjøres det alfabetisk, så forslaget alltid blir det samme.' },
    newPartners: { title: 'Nye makkere', description: 'Oppsett der noen allerede har vært makkere i kveld, unngås. Slik spiller alle med alle.' },
    balance: {
      title: 'Jevne lag',
      description: ({ tolerance }) => `Oppsettet med minst forskjell i lagrating velges. Forskjeller under ${tolerance} poeng regnes som like.`,
    },
    seasonVariety: { title: 'Variasjon', description: 'Par som sjelden har spilt sammen denne sesongen, foretrekkes.' },
  },

  about: {
    teamsLink: 'Slik foreslås lag',
    teamsTitle: 'Slik foreslås lag',
    teamsIntro: 'Før hver kamp foreslår appen lag. Du kan alltid endre forslaget ved å trykke på spillerne.',
    benchHeading: '1. Hvem spiller',
    benchIntro: 'Gjelder bare når flere enn fire er med. Reglene brukes i rekkefølge; neste regel avgjør bare ved likhet.',
    splitHeading: '2. Hvem spiller sammen',
    splitIntro: 'De tre mulige lagoppsettene sammenlignes regel for regel, i denne rekkefølgen.',
    ratingLink: 'Slik fungerer rating',
    ratingTitle: 'Slik fungerer rating',
    ratingParagraphs: ({ START, K, SCALE, PROVISIONAL_GAMES }) => [
      `Alle starter på ${START} poeng. Ratingen oppdateres etter hvert spill, også i kamper som ikke ble spilt ferdig.`,
      'Et lags rating er snittet av de to spillerne. Før hvert spill regnes det ut hvor sannsynlig det er at laget vinner, ut fra forskjellen i rating.',
      `Seier teller 1, uavgjort ½ og tap 0. Endringen er ${K} × (resultat − forventet), og begge på laget får samme endring. Uavgjort mot et sterkere lag gir derfor poeng.`,
      `Med ${SCALE} poeng i forskjell er det sterke laget forventet å vinne omtrent 10 av 11 spill.`,
      `De første ${PROVISIONAL_GAMES} spillene er ratingen foreløpig og merket «ny».`,
    ],
  },
```

- [ ] **Step 2: Create `docs/js/views/about/teams.js`**

```js
import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { BALANCE_TOLERANCE, BENCH_RULES, SPLIT_RULES } from '../../domain/proposal.js';

/** Rendered from the rule definitions, so the page always matches what the app does. */
export function mountAboutTeams(root) {
  const describe = (text) => (typeof text === 'function' ? text({ tolerance: BALANCE_TOLERANCE }) : text);
  const ruleList = (rules) =>
    h('ol', { class: 'rule-list' }, rules.map(({ id }) =>
      h('li', {},
        h('strong', {}, t.rules[id].title),
        h('p', { class: 'muted' }, describe(t.rules[id].description)))));

  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.about.teamsTitle),
      h('p', {}, t.about.teamsIntro),
      h('h2', {}, t.about.benchHeading),
      h('p', { class: 'muted' }, t.about.benchIntro),
      ruleList(BENCH_RULES),
      h('h2', {}, t.about.splitHeading),
      h('p', { class: 'muted' }, t.about.splitIntro),
      ruleList(SPLIT_RULES)),
  );
  return {};
}
```

- [ ] **Step 3: Create `docs/js/views/about/rating.js`**

```js
import { h } from '../components/dom.js';
import { t } from '../../i18n/nb.js';
import { ELO } from '../../domain/elo.js';

/** Rendered from the Elo constants, so the page always matches the calculation. */
export function mountAboutRating(root) {
  root.replaceChildren(
    h('section', { class: 'stack' },
      h('h1', {}, t.about.ratingTitle),
      t.about.ratingParagraphs(ELO).map((text) => h('p', {}, text))),
  );
  return {};
}
```

- [ ] **Step 4: Register routes in `docs/js/views/routes.js`** — add the imports and two entries:

```js
import { mountAboutTeams } from './about/teams.js';
import { mountAboutRating } from './about/rating.js';
```

```js
  '/about/teams': mountAboutTeams,
  '/about/rating': mountAboutRating,
```

- [ ] **Step 5: Link the rating page from the stats placeholder** — replace the body of `mountStats` in `docs/js/views/stats/stats.js`:

```js
export function mountStats(root) {
  root.replaceChildren(
    h('section', { class: 'stack' },
      h('p', { class: 'muted' }, t.statsComingSoon),
      h('a', { class: 'link', href: '#/about/rating' }, t.about.ratingLink)),
  );
  return {};
}
```

- [ ] **Step 6: Styles**

Append to `docs/css/base.css`:

```css
h2 {
  margin: var(--space-3) 0 0;
  font-size: var(--text-lg);
  font-weight: 650;
}
```

Append to `docs/css/components.css`:

```css
.link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}
```

Create `docs/css/views/about.css`:

```css
.rule-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-left: var(--space-5);
}

.rule-list p {
  margin-top: var(--space-1);
}
```

Add to `docs/index.html` after the `play.css` link:

```html
  <link rel="stylesheet" href="css/views/about.css">
```

- [ ] **Step 7: Verify** — `npm test` passes; `node --check` on the new/changed JS files; serve `docs/` and confirm `#/about/teams` and `#/about/rating` return the page (HTTP 200 for the modules).

- [ ] **Step 8: Commit**

```bash
git add docs/js/i18n/nb.js docs/js/views/about docs/js/views/routes.js docs/js/views/stats/stats.js docs/index.html docs/css
git commit -m "feat(about): pages explaining team proposals and ratings"
```

---

### Task 5: Proposals on the new-match screen

**Files:**
- Modify: `docs/js/views/play/new-match.js`, `docs/css/views/play.css`

- [ ] **Step 1: Replace `docs/js/views/play/new-match.js`**

```js
import { h } from '../components/dom.js';
import { showToast } from '../components/toast.js';
import { t } from '../../i18n/nb.js';
import { byName } from '../../domain/players.js';
import { currentMatch, currentNight, gamesOf, score } from '../../domain/match.js';
import { isProvisional, rateGames, ratingOf } from '../../domain/elo.js';
import { proposeTeams } from '../../domain/proposal.js';

const TEAM_SIZE = 2;
const NEXT_SIDE = { bench: 'A', A: 'B', B: 'bench' };

export function mountNewMatch(root, { store, actions, navigate }) {
  /** @type {Map<string, 'A' | 'B'>} players not in the map are on the bench */
  const sides = new Map();
  /** Set once the user changes the proposal; from then on store updates keep their choice. */
  let touched = false;
  /** Set once a start is under way, so a second tap cannot start another match. */
  let starting = false;
  const count = (side) => [...sides.values()].filter((s) => s === side).length;
  const team = (side) => [...sides].filter(([, s]) => s === side).map(([name]) => name).sort(byName);

  function applyProposal(proposal) {
    sides.clear();
    proposal?.A.forEach((name) => sides.set(name, 'A'));
    proposal?.B.forEach((name) => sides.set(name, 'B'));
  }

  /** Moves a player bench → A → B → bench, skipping full teams. */
  function cycle(name) {
    touched = true;
    let side = NEXT_SIDE[sides.get(name) ?? 'bench'];
    if (side === 'A' && count('A') === TEAM_SIZE) side = 'B';
    if (side === 'B' && count('B') === TEAM_SIZE) side = 'bench';
    if (side === 'bench') sides.delete(name);
    else sides.set(name, side);
    update();
  }

  function useProposal() {
    touched = false;
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
    if (starting || !confirmAbandon()) return;
    starting = true;
    update();
    const [A1, A2] = team('A');
    const [B1, B2] = team('B');
    const result = actions.startMatch({ A1, A2, B1, B2 });
    if (!result.ok) {
      starting = false;
      update();
      return showToast(t.errors[result.error]);
    }
    navigate('/play/match');
  }

  const reasons = (proposal) => [
    proposal.bench.length > 0 && t.proposal.bench(proposal.bench.join(t.and), t.rules[proposal.benchRule].title),
    proposal.splitRule ? t.proposal.split(t.rules[proposal.splitRule].title) : t.proposal.splitTie,
  ].filter(Boolean);

  const playerRow = (name, rated) => {
    const side = sides.get(name) ?? 'bench';
    const rating = Math.round(ratingOf(rated, name));
    return h('li', {},
      h('button', { class: 'assign-row', type: 'button', 'data-side': side, onclick: () => cycle(name) },
        h('span', { class: 'assign-name' }, name),
        h('span', { class: 'assign-rating' }, isProvisional(rated, name) ? `${rating} · ${t.provisional}` : String(rating)),
        h('span', { class: 'assign-side' }, t.sides[side])));
  };

  function update() {
    const ds = store.get();
    const night = currentNight(ds);
    if (!night) {
      root.replaceChildren(h('p', { class: 'muted' }, t.errors.noNight));
      return;
    }
    const rated = rateGames(ds);
    const proposal = proposeTeams(ds, rated);
    if (!touched) applyProposal(proposal);
    const ready = count('A') === TEAM_SIZE && count('B') === TEAM_SIZE;

    root.replaceChildren(
      h('section', { class: 'stack' },
        h('h1', {}, t.newMatch),
        proposal && !touched && h('ul', { class: 'proposal-reasons' }, reasons(proposal).map((text) => h('li', {}, text))),
        touched && proposal && h('button', { class: 'btn btn-ghost', type: 'button', onclick: useProposal }, t.proposal.useProposal),
        h('p', { class: 'muted' }, t.pickTeams),
        h('ul', { class: 'assign-list' }, night.players.map((name) => playerRow(name, rated))),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !ready || starting, onclick: start }, t.startMatch),
        h('a', { class: 'link center', href: '#/about/teams' }, t.about.teamsLink)),
    );
  }

  update();
  return { update };
}
```

- [ ] **Step 2: Styles** — in `docs/css/views/play.css`, add `gap: var(--space-3);` to the existing `.assign-row` rule, then append:

```css
.assign-name {
  flex: 1;
}

.assign-rating {
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.proposal-reasons {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-raised);
  list-style: none;
}
```

- [ ] **Step 3: Verify** — `npm test` passes; `node --check docs/js/views/play/new-match.js`. The controller verifies in a browser.

- [ ] **Step 4: Commit**

```bash
git add docs/js/views/play/new-match.js docs/css/views/play.css
git commit -m "feat(play): propose teams with reasons and ratings on new match"
```

---

### Task 6: Verify, update spec, publish (controller)

- [ ] Headless browser run on an offline copy (API_URL empty): five players → new match shows a proposal with "Står over: …" and a split reason; ratings shown with "ny"; tapping a player reveals "Bruk forslaget", which restores the proposal; record a match → the next proposal changes pairs and rotates the bench; `#/about/teams` lists 4 + 3 rules; `#/about/rating` shows the constants.
- [ ] Spec §7: mention `BALANCE_TOLERANCE` (10) and that the shown reason is the most important deciding rule; an empty open match is ignored.
- [ ] Code review of the phase (domain + views), fix findings.
- [ ] Push as `fmmr` (see memory: switch gh account, push with gh credential helper, switch back).
