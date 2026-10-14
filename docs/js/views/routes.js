import { mountHome } from './play/home.js';
import { mountStartNight } from './play/start-night.js';
import { mountNewMatch } from './play/new-match.js';
import { mountMatch } from './play/match.js';
import { mountStats } from './stats/stats.js';
import { mountAboutTeams } from './about/teams.js';
import { mountAboutRating } from './about/rating.js';

export const routes = {
  '/': mountHome,
  '/play': mountHome,
  '/play/night': mountStartNight,
  '/play/new-match': mountNewMatch,
  '/play/match': mountMatch,
  '/stats': mountStats,
  '/about/teams': mountAboutTeams,
  '/about/rating': mountAboutRating,
};
