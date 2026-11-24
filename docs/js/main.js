import { API_URL, SANDBOX_TAP_COOLDOWN_MS, TAP_COOLDOWN_MS } from './config.js';
import { createApiClient } from './api/client.js';
import { MAIN_LEAGUE, leagueFromSearch, leagueUrl, storagePrefix } from './leagues.js';
import { createStorage } from './state/storage.js';
import { createLeagues } from './state/leagues.js';
import { createOutbox } from './state/outbox.js';
import { createStore } from './state/store.js';
import { createActions } from './state/actions.js';
import { createClock } from './state/clock.js';
import { createRouter, navigate } from './router.js';
import { currentNight } from './domain/match.js';
import { routes } from './views/routes.js';
import { markActiveTab, mountLeagueLabel, mountShell } from './views/shell.js';
import { showToast } from './views/components/toast.js';
import { askForPin } from './views/components/pin-prompt.js';
import { describeDrop } from './views/sync-messages.js';
import { t } from './i18n/nb.js';
import { followSystemTheme } from './theme.js';
import { registerServiceWorker } from './pwa.js';

// ?sandbox: fake backend, generated data, pretend date, own storage namespace (spec §17).
// Sandbox code is only loaded in sandbox mode.
const sandbox = new URLSearchParams(location.search).has('sandbox');
const sandboxModules = sandbox
  ? await Promise.all([import('./sandbox/backend.js'), import('./views/sandbox-bar.js')])
  : null;

// Leagues: each has its own sheet, PIN and own data on this phone. `?l=` names the league; a bare
// address opens the one used last. Test mode ignores leagues. See design spec §19.
const leagues = createLeagues({
  mainName: t.appName,
  check: async (id) => {
    const response = await createApiClient({ url: API_URL, league: id }).getAll();
    return response.ok ? { ok: true, name: response.data?.league?.name } : { ok: false, error: response.error };
  },
});
// A message that has to survive the reload that follows it.
const NOTICE_KEY = 'sjineser-notice';
const notice = sessionStorage.getItem(NOTICE_KEY);
if (notice) {
  sessionStorage.removeItem(NOTICE_KEY);
  showToast(notice);
}
const fromAddress = sandbox ? null : leagueFromSearch(location.search);
const league = sandbox ? MAIN_LEAGUE : fromAddress ?? leagues.current();
// A league from an address is only made the current one once the server has confirmed it exists (below).
if (!sandbox && leagues.list().some((known) => known.id === league)) leagues.select(league);
if (!sandbox && !fromAddress && league !== MAIN_LEAGUE) history.replaceState(null, '', leagueUrl(location, league, location.hash));

const storage = createStorage(localStorage, sandbox ? 'sjineser-sandbox:' : storagePrefix(league));
const leagueApi = createApiClient({ url: API_URL, league });
const api = sandbox
  ? sandboxModules[0].createSandboxApi({ storage })
  : {
    ...leagueApi,
    async getAll() {
      const response = await leagueApi.getAll();
      if (response.ok) {
        leagues.remember(league, response.data?.league?.name);
        leagues.select(league);
      } else if (response.error === 'invalid' && league !== MAIN_LEAGUE) {
        // The server no longer knows this league (deleted, or a mistyped link): forget it here and go to the main league.
        const name = leagues.nameOf(league);
        const listed = leagues.forget(league);
        sessionStorage.setItem(NOTICE_KEY, listed ? t.leagues.removed(name) : t.leagues.unknown);
        location.replace(leagueUrl(location, MAIN_LEAGUE));
      }
      return response;
    },
  };
const clock = createClock({ storage: sandbox ? storage : null });

let store;
let updateBadge;
const outbox = createOutbox({
  storage,
  send: (op) => api.post(op.action, op.payload, storage.get('pin', '')),
  onSent: (op) => store.commit(op),
  onChange: () => {
    store?.recompute();
    updateBadge?.();
  },
  onDrop: (op, response) => {
    showToast(describeDrop(op, response));
    store.refresh();
  },
  onPinRequired: () => askForPin({ storage, outbox }),
});
store = createStore({ storage, outbox, api });
const actions = createActions({
  store,
  outbox,
  clock,
  api,
  pin: () => storage.get('pin', ''),
  askPin: () => askForPin({ storage, outbox }),
});

updateBadge = mountShell({ outbox, storage });
if (!sandbox) mountLeagueLabel({ leagues, league });
if (sandbox) {
  sandboxModules[1].mountSandboxBar({
    clock,
    // The data does not change with the date, so re-mount the current view instead of waiting for the store.
    onDateChange: () => window.dispatchEvent(new HashChangeEvent('hashchange')),
    onReset: async () => {
      await api.reset();
      storage.set('outbox', []);
      storage.set('dataset', null);
      location.reload();
    },
    minDate: () => currentNight(store.get())?.date,
  });
}
const router = createRouter({
  root: document.getElementById('view'),
  routes,
  ctx: {
    store,
    actions,
    navigate,
    clock,
    sandbox,
    tapCooldownMs: sandbox ? SANDBOX_TAP_COOLDOWN_MS : TAP_COOLDOWN_MS,
    // The open league; its name is read when a view renders, as the server tells it after the first load.
    league: { id: league, isMain: league === MAIN_LEAGUE, get name() { return leagues.nameOf(league); } },
    leagues,
    unsynced: () => outbox.pending().length,
  },
  onRoute: markActiveTab,
});
router.start();
// theme-init.js already set the theme; charts restyle themselves on `themechange`.
followSystemTheme();

store.refresh().catch(() => false).then((ok) => {
  if (!ok) showToast(t.offline);
});
outbox.flush();
registerServiceWorker({
  onUpdateReady: () => showToast(t.update.ready, { action: { label: t.update.reload, onClick: () => location.reload() } }),
});

function resync() {
  outbox.flush();
  store.refresh();
}
window.addEventListener('online', resync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resync();
});
