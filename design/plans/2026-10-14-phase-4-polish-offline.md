# Sjineser Phase 4 — Polish and Offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the approved visual refresh with native-feeling interactions, add a theme switch and a home link, and make the app open offline via a service worker.

**Context:** Branch `design-refresh` holds the approved prototype (commit 63e7d1e). Spec: `design/specs/2026-10-14-sjineser-design.md` §10–12. Conventions as before: JSDoc, 2-space, single quotes, semicolons, no default exports; tokens in `docs/css/tokens.css`; no inline CSS/JS in HTML; all text in `docs/js/i18n/nb.js`; views only render; respect `prefers-reduced-motion`; mobile first; tap targets ≥ `--tap`.

---

### Task 1: Home link and theme switch

- Header logo + "Sjineser" become a link to `#/play` (keeps `?sandbox`, only the hash changes); accessible name from nb.js.
- Theme:
  - `docs/js/theme-init.js` — a **classic (non-module) script** loaded synchronously in `<head>` via `<script src="js/theme-init.js"></script>` (external file, not inline). It reads `localStorage['sjineser:theme']` (`'dark'` | `'light'`), else resolves from `matchMedia('(prefers-color-scheme: light)')` (dark when unknown), and sets `document.documentElement.dataset.theme` before first paint. Also updates `<meta name="theme-color">`.
  - `docs/js/theme.js` (module): `currentTheme()`, `setTheme(theme)` (persist explicit choice, set attribute, update theme-color meta, dispatch a `themechange` event), and, while no explicit choice is stored, follow system changes via `matchMedia(...).addEventListener('change', …)`.
  - CSS: replace the `@media (prefers-color-scheme: light)` token block with `:root[data-theme="light"] { … }` (and `color-scheme` per theme). Keep a `@media (prefers-color-scheme: light) { :root:not([data-theme]) { … } }` fallback only if it can be done without duplicating the token list — otherwise rely on theme-init.js (it always sets the attribute).
  - Toggle button in the header (`views/components/theme-toggle.js`): sun/moon icon from `icons.js`, `aria-label`/`aria-pressed` from nb.js, ≥ 44 px target; on `themechange` the router re-renders the current view so charts pick up token colours (e.g. dispatch `hashchange`).
- Tests: `theme.js` pure parts (resolve logic with injected storage/matchMedia).
- Commit `feat(ui): home link and dark/light switch`.

### Task 2: Bottom sheets instead of browser dialogs

- `views/components/sheet.js`: `openSheet({ title, body, actions })` → Promise; slide-up panel over a dimmed backdrop, focus trapped inside, Escape/backdrop closes (resolves cancel), `aria-modal`, `role="dialog"`, returns focus on close; respects reduced motion; safe-area bottom padding.
- `confirmSheet({ title, message, confirmLabel, cancelLabel, destructive })` → `Promise<boolean>`.
- `pinSheet()` → `Promise<string | null>`: input `type="password"` with `inputmode="numeric"`, `autocomplete="one-time-code"` off/`off`, enter submits.
- Replace: `window.prompt` in `components/pin-prompt.js`; `window.confirm` in `play/new-match.js` (abandon) and the sandbox bar reset (`main.js` onReset flow or `sandbox-bar.js`). Keep behaviour identical otherwise (PIN prompt must not re-open in a loop while one is open).
- Commit `feat(ui): bottom sheets for PIN and confirmations`.

### Task 3: Motion and loading

- Router: wrap view swaps in `document.startViewTransition` when available and motion is allowed; a subtle cross-fade/slide via `::view-transition-*` CSS.
- Skeletons: a `views/components/skeleton.js` used by home and stats while `!store.isLoaded() && !store.hasTried()` instead of the "Laster …" text.
- Match screen: when a team's score changes, a short scale/fade on the number (CSS class toggled for one animation); `navigator.vibrate?.(10)` on a recorded result (guarded; no-op on iOS).
- Commit `feat(ui): view transitions, skeletons, score feedback`.

### Task 4: Service worker (offline)

- `docs/sw.js` (scope `./`), registered from `main.js` (`navigator.serviceWorker?.register('sw.js')`) when `location.protocol === 'https:'` or the host is `localhost`/`127.0.0.1`.
- `CACHE = 'sjineser-v<N>'` constant; on `install` precache `./`, `index.html`, the CSS files and `js/main.js` (+ `manifest.webmanifest`, icons) and `skipWaiting()`; on `activate` delete other `sjineser-*` caches and `clients.claim()`.
- `fetch`: only same-origin GET. Navigations (`request.mode === 'navigate'`): network-first, fall back to cached `index.html`. Other same-origin assets: stale-while-revalidate (respond from cache if present, update cache from network in the background). Never touch cross-origin requests (Apps Script).
- Document in spec §10 (replace the old service-worker bullet) and bump `CACHE` in releases only when the precache list changes (stale-while-revalidate keeps assets fresh after one load).
- Verify with headless Chrome over CDP: load once, then `Network.emulateNetworkConditions` offline + reload → app renders from cache (sandbox mode works fully offline; real mode shows cached data + offline toast).
- Commit `feat(pwa): service worker for offline start`.

### Task 5: Mobile polish

- `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style` = `black-translucent`, `apple-mobile-web-app-title`; ensure header/tab bar still clear the status bar/home indicator in standalone mode.
- Landscape safe areas: `env(safe-area-inset-left/right)` on header, main, tab bar, toasts, sheets.
- `overscroll-behavior-y: none` on `body` (no accidental pull-to-refresh), `-webkit-touch-callout: none` on buttons, `user-select: none` on tap targets (not on text).
- Re-check all screens at 375 px (iframe or device emulation) in both themes; fix overflow/contrast issues found.
- Commit `feat(ui): mobile polish for standalone and landscape`.

### Task 6: Controller verification and release

- Screenshots (before/after set in /tmp/sjdesign), offline check, code review, fixes, merge `design-refresh` to `main`, push as `fmmr`.
