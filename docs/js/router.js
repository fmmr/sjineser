import { matchRoute, parseHash, scrollsToTop, usesViewTransitions } from './routing.js';

/**
 * Hash router. A view is mount(root, ctx) → { update?(), destroy?() }, where ctx also
 * holds the route's `params` (from ':name' patterns) and `query` (from '?s=…').
 * update() is called whenever the store changes.
 * @param {{ root: HTMLElement, routes: import('./routing.js').Routes, ctx: object, onRoute?: (path: string) => void }} options
 */
export function createRouter({ root, routes, ctx, onRoute = () => {} }) {
  let current = null;
  let currentPath = null;

  function render() {
    current?.destroy?.();
    const { path, query } = parseHash(location.hash);
    const { mount, params } = matchRoute(routes, path);
    root.replaceChildren();
    current = mount(root, { ...ctx, params, query });
    if (scrollsToTop(currentPath, path)) window.scrollTo(0, 0);
    currentPath = path;
    onRoute(path);
  }

  /** Route changes cross-fade where view transitions are safe and motion is welcome (usesViewTransitions; base.css keeps header and tab bar put). */
  function navigateTo() {
    const transitions = usesViewTransitions({
      hasApi: Boolean(document.startViewTransition),
      reducedMotion: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
    if (!transitions) {
      render();
      return;
    }
    const transition = document.startViewTransition(render);
    // A transition interrupted by the next navigation is skipped (render still runs); that is fine.
    transition.ready.catch(() => {});
    // But an error thrown while rendering the view must not vanish.
    transition.updateCallbackDone.catch(console.error);
  }

  return {
    start() {
      window.addEventListener('hashchange', navigateTo);
      ctx.store.subscribe(() => current?.update?.());
      render();
    },
  };
}

/** @param {string} path e.g. '/play/match' or '/stats?s=all' */
export function navigate(path) {
  location.hash = path;
}
