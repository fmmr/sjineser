import { API_URL } from './config.js';
import { createApiClient } from './api/client.js';
import { createSandboxApi } from './sandbox/backend.js';
import { createStorage } from './state/storage.js';
import { createOutbox } from './state/outbox.js';
import { createStore } from './state/store.js';
import { createActions } from './state/actions.js';
import { createClock } from './state/clock.js';
import { createRouter, navigate } from './router.js';
import { routes } from './views/routes.js';
import { markActiveTab, mountShell } from './views/shell.js';
import { mountSandboxBar } from './views/sandbox-bar.js';
import { showToast } from './views/components/toast.js';
import { askForPin } from './views/components/pin-prompt.js';
import { describeDrop } from './views/sync-messages.js';
import { t } from './i18n/nb.js';

// ?sandbox: fake backend, generated data, pretend date, own storage namespace (spec §17).
const sandbox = new URLSearchParams(location.search).has('sandbox');
const storage = createStorage(localStorage, sandbox ? 'sjineser-sandbox:' : 'sjineser:');
const api = sandbox ? createSandboxApi({ storage }) : createApiClient({ url: API_URL });
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
const actions = createActions({ store, outbox, today: clock.today });

updateBadge = mountShell({ outbox, storage });
if (sandbox) {
  // The data does not change with the date, so re-mount the current view instead of waiting for the store.
  mountSandboxBar({ clock, api, storage, onDateChange: () => window.dispatchEvent(new HashChangeEvent('hashchange')) });
}
createRouter({
  root: document.getElementById('view'),
  routes,
  ctx: { store, actions, navigate, clock },
  onRoute: markActiveTab,
}).start();

store.refresh().catch(() => false).then((ok) => {
  if (!ok) showToast(t.offline);
});
outbox.flush();

function resync() {
  outbox.flush();
  store.refresh();
}
window.addEventListener('online', resync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resync();
});
