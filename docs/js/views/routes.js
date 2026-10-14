import { mountHome } from './play/home.js';
import { mountStartNight } from './play/start-night.js';
import { mountNewMatch } from './play/new-match.js';
import { mountMatch } from './play/match.js';
import { mountStats } from './stats/stats.js';

export const routes = {
  '/': mountHome,
  '/play': mountHome,
  '/play/night': mountStartNight,
  '/play/new-match': mountNewMatch,
  '/play/match': mountMatch,
  '/stats': mountStats,
};
