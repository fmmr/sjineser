import { byName } from '../../players.js';

/**
 * Mot hverandre (matrix): for every two players, the row player's game results against the
 * column player (opposite teams of any size). Everyone with games in the period, Norwegian order;
 * null on the diagonal and where they never met. Null with fewer than two players.
 * @type {import('../registry.js').Stat}
 */
export const headToHeadMatrix = {
  id: 'headToHeadMatrix',
  subjects: ['overall'],
  kind: 'matrix',
  compute(facts) {
    const players = [...new Set(facts.rows.map((r) => r.player))].sort(byName);
    if (players.length < 2) return null;
    const index = new Map(players.map((name, i) => [name, i]));
    const cells = players.map(() => players.map(() => null));
    for (const { player, opponents, outcome } of facts.rows) {
      const row = cells[index.get(player)];
      for (const opponent of opponents) {
        const j = index.get(opponent);
        row[j] ??= { W: 0, D: 0, L: 0 };
        row[j][outcome] += 1;
      }
    }
    return { players, cells };
  },
};
