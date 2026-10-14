/**
 * Longest run of consecutive draws within one night (across matches; resets between
 * nights); tie → most recent. No holders. @type {import('../registry.js').Stat}
 */
export const longestDrawStreak = {
  id: 'longestDrawStreak',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    let best = null;
    let run = 0;
    let night = null;
    for (const { date, result } of facts.games) {
      if (date !== night) [night, run] = [date, 0];
      run = result === 'D' ? run + 1 : 0;
      if (run > 0 && (best === null || run >= best.value)) best = { value: run, date };
    }
    return best && { value: best.value, format: 'int', holders: [], date: best.date };
  },
};
