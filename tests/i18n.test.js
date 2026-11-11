import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../docs/js/i18n/nb.js';
import { ELO } from '../docs/js/domain/elo.js';

test('names joins with commas and "og" before the last name', () => {
  assert.equal(t.names([]), '');
  assert.equal(t.names(['Anne']), 'Anne');
  assert.equal(t.names(['Anne', 'Bjørn']), 'Anne og Bjørn');
  assert.equal(t.names(['Anne', 'Bjørn', 'Cato']), 'Anne, Bjørn og Cato');
  assert.equal(t.names(['Anne', 'Bjørn', 'Cato', 'Dag']), 'Anne, Bjørn, Cato og Dag');
});

test('nameSeparator gives the text before each name, matching names', () => {
  const join = (list) => list.map((name, i) => t.nameSeparator(i, list.length) + name).join('');
  for (const list of [['Anne'], ['Anne', 'Bjørn'], ['Anne', 'Bjørn', 'Cato'], ['A', 'B', 'C', 'D']]) {
    assert.equal(join(list), t.names(list));
  }
});

test('the rating page explains the no-show penalty with the Elo constant', () => {
  const text = t.about.ratingParagraphs(ELO).join(' ');
  assert.match(text, new RegExp(`mister ${ELO.NO_SHOW_PENALTY} poeng`));
  assert.match(text, /første kveld/);
});
