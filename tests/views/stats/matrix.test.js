import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbreviate, matrixCellText, matrixTone, winShare } from '../../../docs/js/views/stats/widgets/matrix.js';
import { t } from '../../../docs/js/i18n/nb.js';

test('matrix: a cell tooltip names both players and the results', () => {
  assert.equal(t.statsUi.matrixCell('Anne', 'Bjørn', { W: 3, D: 1, L: 1 }), 'Anne mot Bjørn: 3 seire, 1 uavgjort, 1 tap');
  assert.equal(t.statsUi.matrixCell('Anne', 'Bjørn', { W: 1, D: 0, L: 0 }), 'Anne mot Bjørn: 1 seier, 0 uavgjort, 0 tap');
});

test('matrix: column headers are the first three letters', () => {
  assert.equal(abbreviate('Bjørn'), 'Bjø');
  assert.equal(abbreviate('Ola'), 'Ola');
  assert.equal(abbreviate('Al'), 'Al');
});

test('matrix: win share is wins over games; null where they never met', () => {
  assert.equal(winShare({ W: 3, D: 1, L: 1 }), 0.6);
  assert.equal(winShare({ W: 0, D: 2, L: 0 }), 0);
  assert.equal(winShare(null), null);
});

test('matrix: a cell reads as a whole percent without the sign; empty for null', () => {
  assert.equal(matrixCellText({ W: 3, D: 1, L: 1 }), '60');
  assert.equal(matrixCellText({ W: 2, D: 0, L: 1 }), '67');
  assert.equal(matrixCellText({ W: 1, D: 0, L: 0 }), '100');
  assert.equal(matrixCellText(null), '');
});

test('matrix: tone up with more wins than losses, down with more losses (draws are neutral); strength = margin of the decided games', () => {
  assert.deepEqual(matrixTone({ W: 3, D: 1, L: 1 }), { tone: 'up', strength: 0.5 });
  assert.deepEqual(matrixTone({ W: 4, D: 4, L: 2 }), { tone: 'up', strength: 1 / 3 }, '40 % but ahead of the column player');
  assert.deepEqual(matrixTone({ W: 0, D: 0, L: 4 }), { tone: 'down', strength: 1 });
  assert.deepEqual(matrixTone({ W: 1, D: 0, L: 1 }), { tone: null, strength: 0 });
  assert.deepEqual(matrixTone({ W: 0, D: 2, L: 0 }), { tone: null, strength: 0 });
  assert.equal(matrixTone(null), null);
});
