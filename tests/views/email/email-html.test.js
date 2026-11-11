import { test } from 'node:test';
import assert from 'node:assert/strict';
import { el, escapeHtml, htmlDocument, render } from '../../../docs/js/views/email/email-html.js';

test('escapeHtml escapes markup and quotes', () => {
  assert.equal(escapeHtml('<b>"Tom" & \'Jerry\'</b>'), '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
  assert.equal(escapeHtml(42), '42');
});

test('el: text children are escaped, element children are not escaped twice', () => {
  const html = render(el('p', {}, 'a < b', el('b', {}, 'Tom & Jerry')));
  assert.equal(html, '<p>a &lt; b<b>Tom &amp; Jerry</b></p>');
});

test('el: a style object becomes one inline style attribute; attribute values are escaped', () => {
  const html = render(el('a', { href: 'https://x.no/?a=1&b="2"', style: { color: '#111418', 'font-weight': 600 } }, 'x'));
  assert.equal(html, '<a href="https://x.no/?a=1&amp;b=&quot;2&quot;" style="color:#111418;font-weight:600">x</a>');
});

test('el: null, false and undefined children and attributes are skipped; arrays are flattened', () => {
  const html = render(el('td', { width: null, align: 'right', colspan: false }, [null, 'a', [false, 'b']], undefined));
  assert.equal(html, '<td align="right">ab</td>');
});

test('el: void elements have no closing tag', () => {
  assert.equal(render(el('br', {})), '<br>');
});

test('htmlDocument wraps a body in a complete UTF-8 document with a title', () => {
  const html = htmlDocument('Kveld <1>', el('p', {}, 'x'), { background: '#f5f6f8' });
  assert.match(html, /^<!doctype html><html lang="nb"><head><meta charset="utf-8">/);
  assert.match(html, /<title>Kveld &lt;1&gt;<\/title>/);
  assert.match(html, /<body style="margin:0;padding:0;background:#f5f6f8"><p>x<\/p><\/body><\/html>$/);
});
