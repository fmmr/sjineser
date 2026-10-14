/** Games played. @type {import('../registry.js').Stat} */
export const gamesCount = {
  id: 'gamesCount',
  subjects: ['overall'],
  kind: 'number',
  compute: (facts) => ({ value: facts.games.length, format: 'int' }),
};
