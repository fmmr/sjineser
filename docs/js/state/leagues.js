import { MAIN_LEAGUE, isLeagueId, parseLeagueInput } from '../leagues.js';

const KEY = 'sjineser-leagues';

/**
 * The leagues this phone knows and the one that is open. It lives outside every league's own
 * storage (it is what picks the storage), and is shared by a browser's tabs but not by the
 * home-screen app, which has storage of its own on iOS.
 *
 * `join` takes whatever a person pasted, asks the server whether such a league exists, and
 * remembers it with the name the server gave; nothing unverified is ever listed.
 * @param {{
 *   backend?: Pick<Storage, 'getItem' | 'setItem'>,
 *   mainName: string,
 *   check: (id: string) => Promise<{ ok: true, name: string } | { ok: false, error: string }>,
 * }} deps
 */
export function createLeagues({ backend = globalThis.localStorage, mainName, check }) {
  function read() {
    try {
      const saved = JSON.parse(backend.getItem(KEY));
      const leagues = Array.isArray(saved?.leagues)
        ? saved.leagues.filter((l) => isLeagueId(l?.id) && typeof l.name === 'string' && l.name.trim())
        : [];
      const named = typeof saved?.mainName === 'string' && saved.mainName.trim() ? saved.mainName : null;
      return { current: isLeagueId(saved?.current) ? saved.current : MAIN_LEAGUE, leagues, mainName: named };
    } catch {
      return { current: MAIN_LEAGUE, leagues: [], mainName: null };
    }
  }
  const write = (state) => backend.setItem(KEY, JSON.stringify(state));
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const list = () => {
    const state = read();
    return [{ id: MAIN_LEAGUE, name: state.mainName ?? mainName }, ...state.leagues.filter((l) => l.id !== MAIN_LEAGUE)];
  };

  const leagues = {
    /** The league that was open last, or the main league. */
    current: () => read().current,
    /** Known leagues, the main league first. @returns {{ id: string, name: string }[]} */
    list,
    /** @param {string} id */
    nameOf: (id) => list().find((league) => league.id === id)?.name ?? id,
    /** Marks a league as the one in use. @param {string} id */
    select(id) {
      const state = read();
      if (state.current === id) return;
      write({ ...state, current: id });
    },
    /** Adds a league, or updates its name (the main league has a name too: the server's, else `mainName`). @param {string} id @param {string} name */
    remember(id, name) {
      if (!name?.trim()) return;
      const state = read();
      if (id === MAIN_LEAGUE) {
        if (list()[0].name === name) return;
        write({ ...state, mainName: name });
        notify();
        return;
      }
      const known = state.leagues.find((l) => l.id === id);
      if (known?.name === name) return;
      write({ ...state, leagues: [...state.leagues.filter((l) => l.id !== id), { id, name }] });
      notify();
    },
    /** Calls `listener` whenever a name is added or changed. @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * @param {string} input a link or a code
     * @returns {Promise<{ ok: true, id: string } | { ok: false, error: 'badCode' | 'unknown' | 'network' }>}
     */
    async join(input) {
      const id = parseLeagueInput(input);
      if (!id) return { ok: false, error: 'badCode' };
      if (id === MAIN_LEAGUE) return { ok: true, id };
      const found = await check(id);
      if (!found.ok) return { ok: false, error: found.error === 'network' ? 'network' : 'unknown' };
      leagues.remember(id, found.name);
      return { ok: true, id };
    },
  };
  return leagues;
}
