/*
 * Classic (non-module) script loaded synchronously in <head>, so the right theme is set
 * before first paint. Same rules as js/theme.js (tests check they agree): an explicit
 * choice in localStorage wins, otherwise the device preference, dark when unknown.
 */
(function () {
  var colors = { dark: '#0b0d10', light: '#f5f6f8' };
  var theme = null;
  try {
    theme = localStorage.getItem('sjineser:theme');
  } catch (e) {
    // Storage unavailable: follow the device.
  }
  if (theme !== 'dark' && theme !== 'light') {
    var light = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
    theme = light ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = colors[theme];
})();
