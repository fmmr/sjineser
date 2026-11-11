/**
 * A tiny HTML string builder for emails (spec §9). Mail clients ignore stylesheets, so email
 * markup carries inline styles: el() takes a style object and writes it as a `style` attribute.
 * This, and views/email/night-email.js, are the ONLY places with inline styles; the app itself
 * always styles through css/ (and the DOM through views/components/dom.js).
 *
 * Text is escaped on the way in, so a name like "<b>" can never become markup; elements built
 * with el() are kept as they are (not escaped twice).
 */

const VOID = new Set(['br', 'hr', 'img', 'meta']);
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Built markup: render() keeps it as is, while plain strings are escaped. */
class Html {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }
}

/** @param {unknown} text @returns {string} the text with &, <, >, " and ' escaped */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** @param {Record<string, string | number>} style @returns {string} e.g. 'color:#111;font-weight:600' */
const styleText = (style) => Object.entries(style).map(([key, value]) => `${key}:${value}`).join(';');

/**
 * Children as HTML: nested arrays flattened, null/undefined/false skipped, strings escaped.
 * @param {unknown} children @returns {string}
 */
export function render(children) {
  if (children === null || children === undefined || children === false) return '';
  if (Array.isArray(children)) return children.map(render).join('');
  if (children instanceof Html) return children.value;
  return escapeHtml(children);
}

/**
 * An element as built markup. Attributes named `style` may be an object; null/undefined/false
 * attributes are skipped; values are escaped.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...unknown} children text, el() results, arrays of them
 * @returns {Html}
 */
export function el(tag, attrs = {}, ...children) {
  const attributes = Object.entries(attrs)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escapeHtml(key === 'style' && typeof value === 'object' ? styleText(value) : value)}"`)
    .join('');
  const open = `<${tag}${attributes}>`;
  return new Html(VOID.has(tag) ? open : `${open}${render(children)}</${tag}>`);
}

/**
 * A complete HTML document (UTF-8, Norwegian, phone-sized viewport) around a body.
 * @param {string} title
 * @param {unknown} body el() results
 * @param {Record<string, string>} [bodyStyle] added after margin:0;padding:0
 * @returns {string}
 */
export function htmlDocument(title, body, bodyStyle = {}) {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
  ].join('');
  const style = styleText({ margin: 0, padding: 0, ...bodyStyle });
  return `<!doctype html><html lang="nb"><head>${head}</head><body style="${style}">${render(body)}</body></html>`;
}
