import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCRIPTION_PARAMS } from '../../../docs/js/views/stats/description-params.js';
import { FORM_GAMES, MIN_DECISIVE_GAMES, MIN_GAMES_TOGETHER } from '../../../docs/js/domain/stats/constants.js';
import { ELO } from '../../../docs/js/domain/elo.js';
import { STATS } from '../../../docs/js/domain/stats/registry.js';
import { t } from '../../../docs/js/i18n/nb.js';

test('description params come from the domain constants', () => {
  assert.equal(DESCRIPTION_PARAMS.minGames, MIN_GAMES_TOGETHER);
  assert.equal(DESCRIPTION_PARAMS.provisionalGames, ELO.PROVISIONAL_GAMES);
  assert.equal(DESCRIPTION_PARAMS.formGames, FORM_GAMES);
  assert.equal(DESCRIPTION_PARAMS.minDecisiveGames, MIN_DECISIVE_GAMES);
});

test('every description function yields complete text from the shared params', () => {
  for (const { id } of STATS) {
    const { description } = t.stats[id];
    if (typeof description !== 'function') continue;
    const text = description(DESCRIPTION_PARAMS);
    assert.equal(typeof text, 'string', id);
    assert.ok(text !== '' && !/undefined|NaN/.test(text), `${id}: ${text}`);
  }
});
