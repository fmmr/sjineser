import { byName } from '../players.js';

/**
 * What a stat is about (spec §9). Pair names are sorted with byName.
 * @typedef {'overall' | 'player' | 'pair' | 'compare'} SubjectType
 * @typedef {{ type: 'overall' } | { type: 'player', name: string } | { type: 'pair', names: [string, string] }
 *   | { type: 'compare', a: string, b: string }} Subject
 * @typedef {import('./facts.js').Facts} Facts
 * @typedef {import('./facts.js').PlayerGameRow} PlayerGameRow
 */

/** @type {SubjectType[]} */
export const SUBJECT_TYPES = ['overall', 'player', 'pair', 'compare'];

const PAIR_SEPARATOR = '+';

/** @param {string} a @param {string} b @returns {[string, string]} */
const sortedPair = (a, b) => [a, b].sort(byName);

/** @returns {Subject} */
export const overallSubject = () => ({ type: 'overall' });

/** @param {string} name @returns {Subject} */
export const playerSubject = (name) => ({ type: 'player', name });

/** @param {string} a @param {string} b @returns {Subject} names sorted */
export const pairSubject = (a, b) => ({ type: 'pair', names: sortedPair(a, b) });

/** @param {string} a @param {string} b @returns {Subject} order kept: a is shown first */
export const compareSubject = (a, b) => ({ type: 'compare', a, b });

const isName = (value) => typeof value === 'string' && value !== '';
const isPair = (names) => Array.isArray(names) && names.length === 2 && names.every(isName) && names[0] !== names[1];

const SUBJECT_CHECKS = {
  overall: () => true,
  player: ({ name }) => isName(name),
  pair: ({ names }) => isPair(names) && byName(names[0], names[1]) < 0,
  compare: ({ a, b }) => isPair([a, b]),
};

/** Shape check, used by the stats contract. @param {unknown} subject */
export const isValidSubject = (subject) =>
  Object.hasOwn(SUBJECT_CHECKS, subject?.type ?? '') && SUBJECT_CHECKS[subject.type](subject);

/** @param {Facts} facts @param {string} name @returns {PlayerGameRow[]} */
export const playerRows = (facts, name) => facts.rows.filter((r) => r.player === name);

/** A pair's games, one row each, from the first partner's perspective. @param {Facts} facts @param {[string, string]} names */
export const pairRows = (facts, [a, b]) => facts.rows.filter((r) => r.player === a && r.partner === b);

/** Games where a and b were partners, from a's perspective. @param {Facts} facts @param {string} a @param {string} b */
export const togetherRows = (facts, a, b) => pairRows(facts, [a, b]);

/** Games where a played against b, from a's perspective. @param {Facts} facts @param {string} a @param {string} b */
export const againstRows = (facts, a, b) => facts.rows.filter((r) => r.player === a && r.opponents.includes(b));

/** URL form of a pair: 'Anne+Bjørn' (sorted). @param {[string, string]} names */
export const pairKey = ([a, b]) => sortedPair(a, b).join(PAIR_SEPARATOR);

/**
 * @param {string | null | undefined} text e.g. 'Anne+Bjørn', in either order
 * @returns {[string, string] | null} sorted names, or null unless exactly two distinct non-empty names
 */
export function parsePairKey(text) {
  const names = (text ?? '').split(PAIR_SEPARATOR);
  return isPair(names) ? sortedPair(names[0], names[1]) : null;
}
