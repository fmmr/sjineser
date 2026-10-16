import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HT_FP, compute as computeStat, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';
const SPRING = '2026-03-04';
const AUTUMN = { kind: 'season', year: 2026, half: 2 };

const compute = (id, facts) => computeStat(id, facts, OVERALL);

const NIGHTS = [
  { date: N1, matches: [[HF_TP, 'AAA'], [HT_FP, 'ADBDA']] },
  { date: N2, matches: [] },
  { date: N3, matches: [[HF_TP, 'DD'], [HT_FP, '']] },
];

// ---------- gamesPerSetChart ----------

test('gamesPerSetChart: average games per set (sets with games) per played night, decimal', () => {
  assert.deepEqual(compute('gamesPerSetChart', factsOf(NIGHTS)), {
    series: [{ label: 'series_gamesPerSet', points: [{ x: N1, y: 4 }, { x: N3, y: 2 }] }],
    format: 'decimal',
  });
});

test('gamesPerSetChart: null with fewer than 2 played nights (one point is not a trend)', () => {
  assert.equal(compute('gamesPerSetChart', factsOf([])), null);
  assert.equal(compute('gamesPerSetChart', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }, { date: N2, matches: [] }])), null);
});

test('gamesPerSetChart: only nights in the period', () => {
  const facts = factsOf([{ date: SPRING, matches: [[HF_TP, 'AAA']] }, ...NIGHTS], AUTUMN);
  assert.deepEqual(compute('gamesPerSetChart', facts).series[0].points.map((p) => p.x), [N1, N3]);
});

// ---------- drawRateChart ----------

test('drawRateChart: share of games drawn per played night, percent', () => {
  assert.deepEqual(compute('drawRateChart', factsOf(NIGHTS)), {
    series: [{ label: 'series_drawRate', points: [{ x: N1, y: 0.25 }, { x: N3, y: 1 }] }],
    format: 'percent',
  });
});

test('drawRateChart: null with fewer than 2 played nights', () => {
  assert.equal(compute('drawRateChart', factsOf([])), null);
  assert.equal(compute('drawRateChart', factsOf([{ date: N1, matches: [[HF_TP, 'DA']] }])), null);
});
