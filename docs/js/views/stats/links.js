import { buildHash } from '../../routing.js';

/**
 * Stats routes (spec §9). Links only change the hash, so they keep '?sandbox' and the like.
 * @typedef {import('../../domain/stats/subjects.js').Subject} Subject
 */

const enc = encodeURIComponent;

/** @param {Subject} subject @returns {string} e.g. '/stats/pair/Anne+Bj%C3%B8rn' */
export function subjectPath(subject) {
  if (subject.type === 'player') return `/stats/player/${enc(subject.name)}`;
  if (subject.type === 'pair') return `/stats/pair/${subject.names.map(enc).join('+')}`;
  if (subject.type === 'compare') return `/stats/compare/${enc(subject.a)}/${enc(subject.b)}`;
  return '/stats';
}

/** Path of the pairs table. */
export const PAIRS_PATH = '/stats/pairs';

/**
 * A stats link that keeps the season filter ('s') of the current query.
 * @param {string} path
 * @param {Record<string, string>} query
 */
export const statsHref = (path, query) => buildHash(path, query.s ? { s: query.s } : {});
