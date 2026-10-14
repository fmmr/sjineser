/**
 * The catalog of stat plugins (spec §9). Adding a stat = one file in catalog/, one import
 * and one entry here, and its title under t.stats in nb.js.
 * @typedef {import('./subjects.js').SubjectType} SubjectType
 * @typedef {import('./kinds.js').Kind} Kind
 * @typedef {{ id: string, subjects: SubjectType[], kind: Kind,
 *   compute: (facts: import('./facts.js').Facts, subject: import('./subjects.js').Subject) => object | null }} Stat
 *   compute returns a value of `kind`, or null when there is not enough data
 */

/** @type {Stat[]} */
export const STATS = [];

/** @param {string} id @returns {Stat | null} */
export const statById = (id) => STATS.find((s) => s.id === id) ?? null;

/**
 * Registered stats that support a subject type, in catalog order.
 * @param {SubjectType} subjectType
 * @param {Kind[]} [kinds] only these kinds; all kinds when omitted
 * @returns {Stat[]}
 */
export const statsFor = (subjectType, kinds) =>
  STATS.filter((s) => s.subjects.includes(subjectType) && (!kinds || kinds.includes(s.kind)));
