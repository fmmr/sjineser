/**
 * Hash router. A view is mount(root, ctx) → { update?(), destroy?() }.
 * update() is called whenever the store changes.
 */
export function createRouter({ root, routes, ctx, onRoute = () => {} }) {
  let current = null;
  const currentPath = () => location.hash.slice(1) || '/';

  function render() {
    current?.destroy?.();
    const path = currentPath();
    const mount = routes[path] ?? routes['/'];
    root.replaceChildren();
    current = mount(root, ctx);
    onRoute(path);
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      ctx.store.subscribe(() => current?.update?.());
      render();
    },
  };
}

/** @param {string} path e.g. '/play/match' */
export function navigate(path) {
  location.hash = path;
}
