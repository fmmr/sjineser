import { t } from '../i18n/nb.js';
import { parseMatchId } from '../domain/match.js';

/** Text shown when the server rejected a queued op. */
export function describeDrop(op, response) {
  if (op.action === 'startMatch' && response.error === 'conflict') {
    return t.matchTaken(parseMatchId(op.payload.matchId).number);
  }
  return t.rejected[response.error] ?? t.rejected.invalid;
}
