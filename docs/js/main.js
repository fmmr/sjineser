import { API_URL, SANDBOX_TAP_COOLDOWN_MS, TAP_COOLDOWN_MS } from './config.js';
import { createApiClient } from './api/client.js';
import { createStorage } from './state/storage.js';
import { createOutbox } from './state/outbox.js';
import { createStore } from './state/store.js';
import { createActions } from './state/actions.js';
import { createClock } from './state/clock.js';
import { createRouter, navigate } from './router.js';
import { currentNight } from './domain/match.js';
import { routes } from './views/routes.js';
import { markActiveTab, mountShell } from './views/shell.js';
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
const storage = createStorage(localStorage, sandbox ? 'sjineser-sandbox:' : 'sjineser:');
const api = sandbox ? sandboxModules[0].createSandboxApi({ storage }) : createApiClient({ url: API_URL });
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
const actions = createActions({ store, outbox, clock });

updateBadge = mountShell({ outbox, storage });
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
  ctx: { store, actions, navigate, clock, sandbox, tapCooldownMs: sandbox ? SANDBOX_TAP_COOLDOWN_MS : TAP_COOLDOWN_MS },
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
