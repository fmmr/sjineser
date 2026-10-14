import { subjectRows } from '../aggregate.js';

/** Share of games drawn: all games, or the player's / pair's games. @type {import('../registry.js').Stat} */
export const drawRate = {
  id: 'drawRate',
  subjects: ['overall', 'player', 'pair'],
  kind: 'number',
  compute(facts, subject) {
    const outcomes = subject.type === 'overall'
      ? facts.games.map((g) => g.result)
      : subjectRows(facts, subject).map((r) => r.outcome);
    if (outcomes.length === 0) return null;
    return { value: outcomes.filter((o) => o === 'D').length / outcomes.length, format: 'percent' };
  },
};
