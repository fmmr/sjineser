import { API_URL } from './config.js';
import { createApiClient } from './api/client.js';
import { createStorage } from './state/storage.js';
import { createOutbox } from './state/outbox.js';
import { createStore } from './state/store.js';
import { createActions } from './state/actions.js';
import { createClock } from './state/clock.js';
import { createRouter, navigate } from './router.js';
import { routes } from './views/routes.js';
import { markActiveTab, mountShell } from './views/shell.js';
import { showToast } from './views/components/toast.js';
import { askForPin } from './views/components/pin-prompt.js';
import { describeDrop } from './views/sync-messages.js';
import { t } from './i18n/nb.js';

const storage = createStorage();
const api = createApiClient({ url: API_URL });
const clock = createClock();

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
