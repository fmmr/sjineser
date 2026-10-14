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

## Ideas
- Night winners (largest Elo gain per night)
- Form (last 10 games)
- Nights attended, attendance rate
- Sit-outs per player
- Favourite victim (opponent beaten most)
- Most draws in a match
- Highest Elo ever / lowest Elo ever
- Longest win streak (overall record)
- Worst partner
- Average games per match; draw rate trend over time
