/**
 * Headline counts of a whole dataset, for the about page. Nights and matches count only when
 * games were played in them, like the stats overview.
 * @param {import('./match.js').Dataset} dataset
 * @returns {{ players: number, nights: number, matches: number, games: number, firstDate: string | null, latestDate: string | null }}
 */
export function datasetSummary(dataset) {
  const playedMatches = new Set(dataset.games.map((g) => g.matchId));
  const matches = dataset.matches.filter((m) => playedMatches.has(m.matchId));
  const dates = [...new Set(matches.map((m) => m.date))].sort();
  return {
    players: dataset.players.length,
    nights: dates.length,
    matches: matches.length,
    games: dataset.games.length,
    firstDate: dates[0] ?? null,
    latestDate: dates.at(-1) ?? null,
  };
}
