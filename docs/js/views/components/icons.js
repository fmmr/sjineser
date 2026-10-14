/**
 * Inline SVG icons: the card-suit logo mark, the tab bar glyphs and the theme switch. Icons are decorative
 * (aria-hidden); the text next to them carries the meaning. Colours come from CSS.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Suit outlines on a 24 × 24 grid. */
const SUITS = {
  spade: 'M12 2.5c-.5 0-.9.2-1.2.6C8.2 5.9 4 9.3 4 13.1a4 4 0 0 0 6.7 2.9c-.2 1.9-1 3.3-2.3 4.5h7.2c-1.3-1.2-2.1-2.6-2.3-4.5A4 4 0 0 0 20 13.1c0-3.8-4.2-7.2-6.8-10a1.6 1.6 0 0 0-1.2-.6z',
  heart: 'M12 21s-8.5-5.3-8.5-11.4A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.6C20.5 15.7 12 21 12 21z',
  diamond: 'M12 2.5 19 12l-7 9.5L5 12z',
  club: 'M12 3.3a3.7 3.7 0 1 1 0 7.4a3.7 3.7 0 1 1 0-7.4zM7.6 9.5a3.7 3.7 0 1 1 0 7.4a3.7 3.7 0 1 1 0-7.4z'
    + 'M16.4 9.5a3.7 3.7 0 1 1 0 7.4a3.7 3.7 0 1 1 0-7.4zM12 8.5l3 5.5H9zM12.8 13c.2 3.3 1 5.6 2.8 7.5H8.4c1.8-1.9 2.6-4.2 2.8-7.5z',
};

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @param {SVGElement[]} [children]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
}

/** @param {SVGElement[]} children @param {string} [viewBox] */
const svg = (children, viewBox = '0 0 24 24') =>
  svgEl('svg', { viewBox, 'aria-hidden': 'true', focusable: 'false' }, children);

/** The four suits in a 2 × 2 grid, like the app icon; hearts and diamonds use the muted red. */
export function logoMark() {
  const cell = (suit, x, y, red) => svgEl('path', {
    d: SUITS[suit],
    transform: `translate(${x} ${y}) scale(0.5)`,
    ...(red ? { class: 'suit-red' } : { fill: 'currentColor' }),
  });
  return svg([
    cell('spade', 0, 0, false),
    cell('heart', 12, 0, true),
    cell('diamond', 0, 12, true),
    cell('club', 12, 12, false),
  ]);
}

/** Outline glyph per tab; parts marked icon-fill fill in when the tab is active (layout.css). */
const TAB_ICONS = {
  play: () => svg([svgEl('path', {
    d: SUITS.spade, class: 'icon-fill', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round',
  })]),
  stats: () => svg([
    svgEl('rect', { x: '4', y: '12', width: '4', height: '8', rx: '1.2', class: 'icon-fill', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }),
    svgEl('rect', { x: '10', y: '4', width: '4', height: '16', rx: '1.2', class: 'icon-fill', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }),
    svgEl('rect', { x: '16', y: '9', width: '4', height: '11', rx: '1.2', class: 'icon-fill', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }),
  ]),
};

/** @param {'play' | 'stats'} tab @returns {SVGElement} */
export const tabIcon = (tab) => TAB_ICONS[tab]();

const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

/** Eight short rays around the sun's disc. */
const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  const at = (r) => [12 + r * Math.cos(angle), 12 + r * Math.sin(angle)].map((v) => v.toFixed(2)).join(' ');
  return `M${at(7)}L${at(9)}`;
}).join('');

/** Theme switch glyph: the sun in the light theme, the moon in the dark one. */
const THEME_ICONS = {
  light: () => svg([svgEl('circle', { cx: '12', cy: '12', r: '4', ...stroke }), svgEl('path', { d: SUN_RAYS, ...stroke })]),
  dark: () => svg([svgEl('path', { d: 'M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1z', ...stroke })]),
};

/** @param {'dark' | 'light'} theme @returns {SVGElement} */
export const themeIcon = (theme) => THEME_ICONS[theme]();

/** Sandbox switch glyph: a test tube. */
export const sandboxIcon = () => svg([
  svgEl('path', { d: 'M9 3h6M10 3v11.5a2 2 0 0 0 4 0V3', ...stroke }),
  svgEl('path', { d: 'M10 10h4', ...stroke }),
]);
