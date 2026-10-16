import { byName } from '../../players.js';
import { playerSubject } from '../subjects.js';

/** Nights in the period where at least one game was played (same rule as nightsCount). */
export const playedNights = (facts) => facts.nights.filter((n) => n.matches.length > 0);

/**
 * Oppmøte: nights each player was there (on the roster — sitting out counts) and their share of
 * the played nights in the period; most nights first. Everyone who has ever played is listed,
 * with 0 for a period they missed (like the leaderboard). @type {import('../registry.js').Stat}
 */
export const attendance = {
  id: 'attendance',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const nights = playedNights(facts);
    if (nights.length === 0) return null;
    const counts = new Map([...facts.rated.gamesPlayed.keys()].map((name) => [name, 0]));
    for (const { players } of nights) players.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
    const rows = [...counts]
      .map(([player, attended]) => ({ player, nights: attended, share: attended / nights.length, subject: playerSubject(player) }))
      .sort((a, b) => b.nights - a.nights || byName(a.player, b.player));
    return { columns: [{ key: 'player', format: 'player' }, { key: 'nights', format: 'int' }, { key: 'share', format: 'percent' }], rows };
  },
};
