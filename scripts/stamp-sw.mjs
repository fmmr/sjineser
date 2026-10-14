/**
 * Stamps docs/sw.js for a release (spec §10): rewrites the generated block with the list of
 * every shipped file (PRECACHE) and a content hash of those files (VERSION), so each release
 * gets one complete, versioned cache. Run `npm run stamp` after changing anything in docs/;
 * `npm test` fails while the stamp is stale. Not part of the app; Node built-ins only.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DOCS_DIR = fileURLToPath(new URL('../docs/', import.meta.url));
export const SW_PATH = fileURLToPath(new URL('../docs/sw.js', import.meta.url));

/** Published but not part of the app: the worker itself, the Pages domain file. */
const EXCLUDED = new Set(['sw.js', 'CNAME']);
const BLOCK = /(\/\/ BEGIN GENERATED[^\n]*\n)[\s\S]*?(\/\/ END GENERATED)/;

/**
 * Excludes the files above, dotfiles (.DS_Store, …) and Markdown (vendor licences).
 * @param {string} path relative to docs/, '/'-separated
 * @returns {boolean}
 */
export function isShippable(path) {
  const name = path.split('/').pop();
  return !EXCLUDED.has(path) && !path.split('/').some((part) => part.startsWith('.')) && !name.endsWith('.md');
}

/**
 * Every shipped file under docs/, relative and '/'-separated, sorted by code point.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function shippableFiles(dir = DOCS_DIR) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath ?? entry.path}/${entry.name}`.slice(dir.length).replace(/^\/+/, '').split('\\').join('/'))
    .filter(isShippable)
    .sort();
}

/**
 * First 12 hex chars of SHA-256 over each path and its contents, in the given order.
 * @param {string[]} files relative to dir
 * @param {string} [dir]
 * @returns {string}
 */
export function computeVersion(files, dir = DOCS_DIR) {
  const hash = createHash('sha256');
  for (const path of files) {
    hash.update(`${path}\0`);
    hash.update(readFileSync(`${dir}/${path}`));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * The generated block's contents.
 * @param {string} version
 * @param {string[]} files
 * @returns {string}
 */
export function renderBlock(version, files) {
  return `const VERSION = '${version}';\nconst PRECACHE = [\n${files.map((path) => `  '${path}',\n`).join('')}];\n`;
}

/**
 * Rewrites the generated block of sw.js source.
 * @param {string} source
 * @param {string} version
 * @param {string[]} files
 * @returns {string}
 */
export function stamp(source, version, files) {
  if (!BLOCK.test(source)) throw new Error('sw.js has no "// BEGIN GENERATED … // END GENERATED" block');
  return source.replace(BLOCK, (_, begin, end) => `${begin}${renderBlock(version, files)}${end}`);
}

// Run as a script (also through a symlinked path), not when imported by the tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const files = shippableFiles();
  const version = computeVersion(files);
  const source = readFileSync(SW_PATH, 'utf8');
  const stamped = stamp(source, version, files);
  if (stamped !== source) writeFileSync(SW_PATH, stamped);
  console.log(`sw.js: VERSION ${version}, ${files.length} files${stamped === source ? ' (unchanged)' : ''}`);
}
