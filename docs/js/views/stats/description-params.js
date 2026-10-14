import { MIN_GAMES_TOGETHER } from '../../domain/stats/constants.js';
import { ELO } from '../../domain/elo.js';

/**
 * Values that stat descriptions (t.stats[id].description as a function) may use. The single
 * place where domain constants meet description text: a new constant is added here, not in
 * the widgets.
 * @type {Readonly<{ minGames: number, provisionalGames: number }>}
 */
export const DESCRIPTION_PARAMS = Object.freeze({
  minGames: MIN_GAMES_TOGETHER,
  provisionalGames: ELO.PROVISIONAL_GAMES,
});
