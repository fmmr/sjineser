import { byName } from '../../players.js';
import { bestOf, playedNights } from '../aggregate.js';

/**
 * Most played nights in a row one player was there (on the roster — sitting out counts); nights
 * without games are skipped. Tie → the run that ended most recently; everyone whose equally
 * long run ended on that night shares the record. `date` = the last night of the run.
 * @type {import('../registry.js').Stat}
 */
export const attendanceStreak = {
  id: 'attendanceStreak',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const nights = playedNights(facts);
    /** @type {Map<string, { name: string, current: number, last: number, longest: number, end: number }>} */
    const runs = new Map();
    for (const [index, night] of nights.entries()) {
      for (const name of night.players) {
        const run = runs.get(name) ?? { name, current: 0, last: -1, longest: 0, end: -1 };
        // The run continues only when they were also there the night before.
        run.current = run.last === index - 1 ? run.current + 1 : 1;
        run.last = index;
        if (run.current >= run.longest) [run.longest, run.end] = [run.current, index];
        runs.set(name, run);
      }
    }
    const all = [...runs.values()];
    const best = bestOf(all, (a, b) => a.longest - b.longest || a.end - b.end);
    if (!best) return null;
    const holders = all.filter((run) => run.longest === best.longest && run.end === best.end).map((run) => run.name).sort(byName);
    return { value: best.longest, format: 'int', holders, date: nights[best.end].date };
  },
};
