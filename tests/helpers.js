/** In-memory stand-in for window.localStorage. */
export function memoryBackend() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    /** Every stored key, prefix included. */
    keys: () => [...data.keys()],
  };
}

export const DATE = '2026-10-14';
export const FOUR = ['Frode', 'Hans', 'Per', 'Tor'];
export const MATCH_1 = `${DATE}#1`;

export function dataset(overrides = {}) {
  return { players: [], nights: [], matches: [], games: [], ...overrides };
}

export const game = (matchId, gameNo, result) => ({ matchId, gameNo, result, timestamp: `${DATE}T20:00:00Z` });

/** Four players, one night, match #1 (Hans & Frode vs Tor & Per) with the given results. */
export function nightWithMatch(results = []) {
  return dataset({
    players: FOUR.map((name) => ({ name, active: true })),
    nights: [{ date: DATE, players: FOUR }],
    matches: [{ matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' }],
    games: results.map((result, i) => game(MATCH_1, i + 1, result)),
  });
}
