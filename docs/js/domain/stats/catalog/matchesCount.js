/** Matches with at least one game, finished or not. @type {import('../registry.js').Stat} */
export const matchesCount = {
  id: 'matchesCount',
  subjects: ['overall'],
  kind: 'number',
  compute: (facts) => ({ value: facts.matches.length, format: 'int' }),
};
