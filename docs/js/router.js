import { matchRoute, parseHash } from './routing.js';

/**
 * Hash router. A view is mount(root, ctx) → { update?(), destroy?() }, where ctx also
 * holds the route's `params` (from ':name' patterns) and `query` (from '?s=…').
 * update() is called whenever the store changes.
 * @param {{ root: HTMLElement, routes: import('./routing.js').Routes, ctx: object, onRoute?: (path: string) => void }} options
 */
export function createRouter({ root, routes, ctx, onRoute = () => {} }) {
  let current = null;

  function render() {
    current?.destroy?.();
    const { path, query } = parseHash(location.hash);
    const { mount, params } = matchRoute(routes, path);
    root.replaceChildren();
    current = mount(root, { ...ctx, params, query });
    onRoute(path);
  }

  /** Route changes cross-fade where view transitions exist and motion is welcome (base.css; header and tab bar stay put). */
  function navigateTo() {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) {
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
