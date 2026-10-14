/** Nights with at least one match with games. @type {import('../registry.js').Stat} */
export const nightsCount = {
  id: 'nightsCount',
  subjects: ['overall'],
  kind: 'number',
  compute: (facts) => ({ value: facts.nights.filter((n) => n.matches.length > 0).length, format: 'int' }),
};
