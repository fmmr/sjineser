import { playerRows } from '../subjects.js';

/** Streak kinds and the outcomes that extend them; the label key is t.statsLabels[`streak_${kind}`]. */
const STREAKS = [['win', ['W']], ['unbeaten', ['W', 'D']], ['loss', ['L']]];

/** Current and longest run of each streak kind over the player's games in scope. @type {import('../registry.js').Stat} */
export const streaks = {
  id: 'streaks',
  subjects: ['player'],
  kind: 'table',
  compute(facts, { name }) {
    const rows = playerRows(facts, name);
    if (rows.length === 0) return null;
    return {
      columns: [{ key: 'kind', format: 'label' }, { key: 'current', format: 'int' }, { key: 'longest', format: 'int' }],
      rows: STREAKS.map(([kind, outcomes]) => {
        let current = 0;
        let longest = 0;
        for (const { outcome } of rows) {
          current = outcomes.includes(outcome) ? current + 1 : 0;
          longest = Math.max(longest, current);
        }
        return { kind: `streak_${kind}`, current, longest };
      }),
    };
  },
};
