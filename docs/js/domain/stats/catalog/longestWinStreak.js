import { bestOf, runOf } from '../aggregate.js';
import { playerRows } from '../subjects.js';

/** @param {import('../facts.js').PlayerGameRow} a @param {import('../facts.js').PlayerGameRow} b */
const sameGame = (a, b) => a.matchId === b.matchId && a.gameNo === b.gameNo;

/**
 * Most games won in a row by one player, in canonical order across sets and nights (a draw or
 * loss ends the run); tie → the run that ended most recently. Teammates whose equally long runs
 * end in the same game share the record. `date` = the date of the run's last game.
 * @type {import('../registry.js').Stat}
 */
export const longestWinStreak = {
  id: 'longestWinStreak',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const position = new Map(facts.rows.map((row, index) => [row, index]));
    const runs = facts.players
      .map((name) => ({ name, ...runOf(playerRows(facts, name), ['W']) }))
      .filter((run) => run.longest > 0);
    const best = bestOf(runs, (a, b) => a.longest - b.longest || position.get(a.end) - position.get(b.end));
    if (!best) return null;
    const holders = runs.filter((run) => run.longest === best.longest && sameGame(run.end, best.end)).map((run) => run.name);
    return { value: best.longest, format: 'int', holders, date: best.end.date };
  },
};
