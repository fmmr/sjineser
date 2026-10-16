# Stats ideas

Each idea becomes one stat plugin — see spec §9. Shipping one = a catalog file
(`docs/js/domain/stats/catalog/<id>.js`), one registry line (`domain/stats/registry.js`),
its text in `nb.js` (`t.stats[id]`), and its id in a page list in `views/stats/pages.js`
(compare picks up player `number` / `wdl` / `chart` stats automatically).
Mark ideas `[x]` when shipped.

## Starter set (phase 3)
- [x] Elo leaderboard with change in selected season
- [x] Season summary: nights, matches, games, draw %
- [x] Record: longest match (games)
- [x] Record: longest draw streak
- [x] Record: clean sweeps (3–0 without draws)
- [x] Record: comebacks (0–2 → 3–2)
- [x] Record: biggest upset
- [x] Player: Elo over time
- [x] Player: games W/D/L, win %; matches W/L, win %; draw rate
- [x] Player: streaks (win / unbeaten / loss; current and longest)
- [x] Player: partners and opponents tables; best partner; nemesis
- [x] Pairs table; pair W/D/L, win %, head-to-head vs other pairs
- [x] Compare: player stats side by side, Elo overlay, record together / against

## Shipped later
- [x] Oppmøte: nights attended and share of nights (leaderboard column, player page, compare)
- [x] Kjemi: pairs scoring above or below their expected score, in percentage points (a column in the pairs table, compare)
- [x] Kvelder: list of played nights with players, sets, games, draws and the night winner (largest Elo gain) (overview table)
- [x] Form: last 10 games as S/U/T chips (player page, own section; leaderboard column)
- [x] Favorittoffer: the opponent a player has the highest win share against, min. games apply (player page)
- [x] Dårligste makker: lowest win share with a partner as a pair, min. games apply (player page)
- [x] Høyeste / laveste rating: highest and lowest rating after a game, provisional games left out (overview records; player page Toppnotering / Bunnotering)

- [x] Lengste kveld: night with the most games, who was there (records)
- [x] Kveldsside (`#/stats/night/<date>`): one night's sets as scoreboards, the night's leaderboard (only those who were there, by rating change) with Kveldens vinner, the night's pairs, summary and records; live while the night is ongoing; reached from Kvelder rows, the home cards and the match screen
- [x] Lengste seiersrekke: most games won in a row by one player, across sets and nights (overview and night records)
- [x] Avgjørende spill: win share in games where a team stands at 2 wins and can end the set; min. 5 such games, from the first on a night (player page; overview and night page table; compare)
- [x] Sesongens spiller: largest rating gain per season (half-year), newest first; shown with all seasons selected (overview table; player page: seasons won)
- [x] Oppmøte-rekke: most played nights in a row one player was there, sitting out counts (overview records)

## Ideas (ranked)
1. **Mot hverandre-matrise** — player vs player win share table (best on wide screens).
2. **Snitt spill per sett / uavgjort-andel over tid** — trend chart on the overview.
3. **Flest uavgjort i ett sett** — record (overlaps with "Lengste sett").

## Dropped
- ~~Sit-outs per player~~ — with 3 vs 2 and 3 vs 3 nobody sits out with six or fewer players, so it would almost always be empty.
- ~~Tremannslag vs tomannslag~~ — a player's win share on 3-player vs 2-player teams; owner decided.
