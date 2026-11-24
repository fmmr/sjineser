/** The backup file the server writes (apps-script exportData) and reads back (restoreData). */
export const BACKUP_FORMAT = 'sjineser-backup';
export const BACKUP_VERSION = 1;

/**
 * A backup file's text as an object, or null when it is not a Sjineser backup this app can send
 * to the server (the server validates every row itself; this only catches the wrong file early).
 * @param {string} text
 * @returns {object | null}
 */
export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return null;
  }
  if (!backup || typeof backup !== 'object' || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) return null;
  return ['players', 'nights', 'matches', 'games'].every((key) => Array.isArray(backup[key])) ? backup : null;
}

/**
 * How much a backup holds, for the "are you sure" question.
 * @param {{ players: unknown[], nights: unknown[], matches: unknown[], games: unknown[] }} backup
 * @returns {{ players: number, nights: number, matches: number, games: number }}
 */
export const backupCounts = ({ players, nights, matches, games }) => ({
  players: players.length, nights: nights.length, matches: matches.length, games: games.length,
});

/**
 * File name of a download: the league's name (letters and digits only, so it is safe on every
 * system) and the date. "Jaktlaget", 2026-11-24 → "sjineser-jaktlaget-2026-11-24.json".
 * @param {string} leagueName
 * @param {string} today YYYY-MM-DD
 */
export function backupFileName(leagueName, today) {
  const slug = leagueName.toLowerCase()
    .replaceAll('æ', 'ae').replaceAll('ø', 'o').replaceAll('å', 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `sjineser-${slug || 'liga'}-${today}.json`;
}
