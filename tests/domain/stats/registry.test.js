import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS, statById, statsFor } from '../../../docs/js/domain/stats/registry.js';
import { KINDS, isValidValue } from '../../../docs/js/domain/stats/kinds.js';
import { buildFacts } from '../../../docs/js/domain/stats/facts.js';
import { seasonsIn } from '../../../docs/js/domain/stats/filter.js';
import {
  SUBJECT_TYPES, compareSubject, overallSubject, pairSubject, playerRows, playerSubject,
} from '../../../docs/js/domain/stats/subjects.js';
import { generateHistory } from '../../../docs/js/sandbox/generate.js';
import { t } from '../../../docs/js/i18n/nb.js';

// Contract for every stat plugin: it runs over the whole catalog, so a new stat is checked
// as soon as it is registered.

const { dataset, nextDate } = generateHistory();
const FILTERS = [{ kind: 'all' }, seasonsIn(dataset, nextDate)[0]];
const FACTS = FILTERS.map((filter) => buildFacts(dataset, filter));

/** Representative subjects from all-time ratings: top player, their most frequent pair, top vs bottom. */
function representativeSubjects() {
  const { rated } = FACTS[0];
  const ranked = [...rated.ratings].sort((x, y) => y[1] - x[1]).map(([name]) => name);
  const [top, bottom] = [ranked[0], ranked.at(-1)];
  const partnerGames = new Map();
  for (const { partner } of playerRows(FACTS[0], top)) partnerGames.set(partner, (partnerGames.get(partner) ?? 0) + 1);
  const [partner] = [...partnerGames].sort((x, y) => y[1] - x[1])[0];
  return {
    overall: overallSubject(),
    player: playerSubject(top),
    pair: pairSubject(top, partner),
    compare: compareSubject(top, bottom),
  };
}
const SUBJECTS = representativeSubjects();

test('the fixture covers every subject type and both filters have data', () => {
  assert.deepEqual(Object.keys(SUBJECTS), SUBJECT_TYPES);
  assert.notEqual(SUBJECTS.compare.a, SUBJECTS.compare.b);
  for (const facts of FACTS) assert.ok(facts.games.length > 0);
  assert.equal(FILTERS[1].kind, 'season');
});

test('stat ids are unique', () => {
  const ids = STATS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every stat declares known subjects, a known kind and a compute function', () => {
  for (const stat of STATS) {
    assert.equal(typeof stat.id, 'string', JSON.stringify(stat));
    assert.ok(Array.isArray(stat.subjects) && stat.subjects.length > 0, stat.id);
    for (const type of stat.subjects) assert.ok(SUBJECT_TYPES.includes(type), `${stat.id}: subject ${type}`);
    assert.ok(KINDS.includes(stat.kind), `${stat.id}: kind ${stat.kind}`);
    assert.equal(typeof stat.compute, 'function', stat.id);
  }
});

test('every stat has a title in nb.js', () => {
  for (const { id } of STATS) {
    assert.ok(typeof t.stats[id]?.title === 'string' && t.stats[id].title !== '', `t.stats.${id}.title`);
  }
});

test('every stat returns null or a valid value, and has data under at least one filter', () => {
  for (const stat of STATS) {
    for (const type of stat.subjects) {
      const values = FACTS.map((facts) => stat.compute(facts, SUBJECTS[type]));
      for (const [i, value] of values.entries()) {
        const where = `${stat.id} / ${type} / ${FILTERS[i].kind}`;
        assert.ok(value === null || isValidValue(stat.kind, value), `${where}: ${JSON.stringify(value)}`);
      }
      assert.ok(values.some((value) => value !== null), `${stat.id} / ${type}: no data under any filter`);
    }
  }
});

test('statById finds registered stats and returns null otherwise', () => {
  for (const stat of STATS) assert.equal(statById(stat.id), stat);
  assert.equal(statById('noSuchStat'), null);
});

test('statsFor selects by subject type and optionally by kind', () => {
  for (const type of SUBJECT_TYPES) {
    assert.deepEqual(statsFor(type), STATS.filter((s) => s.subjects.includes(type)));
    assert.deepEqual(statsFor(type, ['number', 'wdl']),
      STATS.filter((s) => s.subjects.includes(type) && ['number', 'wdl'].includes(s.kind)));
  }
  assert.deepEqual(statsFor('team'), []);
});

test('a stat description, if any, is a string or a function', () => {
  for (const { id } of STATS) {
    const { description } = t.stats[id];
    assert.ok(description === undefined || ['string', 'function'].includes(typeof description), `t.stats.${id}.description`);
  }
});

test('every table column has a header and every label cell a text in nb.js', () => {
  for (const stat of STATS.filter((s) => s.kind === 'table')) {
    for (const type of stat.subjects) {
      for (const facts of FACTS) {
        const value = stat.compute(facts, SUBJECTS[type]);
        if (value === null) continue;
        for (const { key, format } of value.columns) {
          assert.equal(typeof t.statsColumns[key], 'string', `${stat.id}: t.statsColumns.${key}`);
          if (format !== 'label') continue;
          for (const row of value.rows) assert.equal(typeof t.statsLabels[row[key]], 'string', `${stat.id}: t.statsLabels.${row[key]}`);
        }
      }
    }
  }
});
