import { mountHome } from './play/home.js';
import { mountStartNight } from './play/start-night.js';
import { mountNewMatch } from './play/new-match.js';
import { mountMatch } from './play/match.js';
import { mountStatsOverview } from './stats/overview.js';
import { mountStatsPlayer } from './stats/player.js';
import { mountStatsPairs } from './stats/pairs.js';
import { mountStatsPair } from './stats/pair.js';
import { mountStatsCompare } from './stats/compare.js';
import { mountAboutTeams } from './about/teams.js';
import { mountAboutRating } from './about/rating.js';
import { mountAbout } from './about/about.js';
import { mountMore } from './more/more.js';
import { mountPlayers } from './more/players.js';

/** @type {import('../routing.js').Routes} */
export const routes = [
  ['/', mountHome],
  ['/play', mountHome],
  ['/play/night', mountStartNight],
  ['/play/new-match', mountNewMatch],
  ['/play/match', mountMatch],
  ['/stats', mountStatsOverview],
  ['/stats/player/:name', mountStatsPlayer],
  ['/stats/pairs', mountStatsPairs],
  ['/stats/pair/:pair', mountStatsPair],
  ['/stats/compare/:a/:b', mountStatsCompare],
  ['/more', mountMore],
  ['/more/players', mountPlayers],
  ['/about', mountAbout],
  ['/about/teams', mountAboutTeams],
  ['/about/rating', mountAboutRating],
];
