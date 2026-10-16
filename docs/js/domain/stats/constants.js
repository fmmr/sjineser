/** Minimum games together (or against) before a partner or opponent can be best partner or nemesis. */
export const MIN_GAMES_TOGETHER = 10;

/** Games shown as form (the player's most recent games in the period). */
export const FORM_GAMES = 10;

/** How many players a count record (e.g. clean sweeps) lists: the ones involved most often. */
export const RANKING_SIZE = 3;

/**
 * Minimum deciding games (a team at 2 wins) before a player's win share in them counts. Lower
 * than MIN_GAMES_TOGETHER: a player gets only a few deciding games per night.
 */
export const MIN_DECISIVE_GAMES = 5;
