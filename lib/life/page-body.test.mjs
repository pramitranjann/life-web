// Run: node --experimental-strip-types lib/life/page-body.test.mjs
// (jsdom comes in transitively; if that ever changes, `npm i -D jsdom`.)
// Checks toggleNthHtmlCheckbox keeps `data-checked` and the nested <input> in
// step. If those two drift apart the reader shows one state and the editor the
// other, which is the exact bug that survived the markdown -> HTML migration.

import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('')
globalThis.DOMParser = dom.window.DOMParser

const { toggleNthHtmlCheckbox } = await import('./page-body.ts')

const html =
  '<ul data-type="taskList">' +
  '<li data-checked="false"><label><input type="checkbox"></label><div><p>one</p></div></li>' +
  '<li data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>two</p></div></li>' +
  '</ul>'

// Unchecked -> checked, and the input gains the attribute.
const first = toggleNthHtmlCheckbox(html, 0)
assert.match(first, /<li data-checked="true">/)
assert.match(first, /<input type="checkbox" checked="checked">/)

// Checked -> unchecked, and the input loses it.
const second = toggleNthHtmlCheckbox(html, 1)
assert.ok(second.includes('data-checked="false"><label><input type="checkbox">'))

// Only the targeted item moves.
assert.ok(toggleNthHtmlCheckbox(html, 0).includes('data-checked="true"><label><input type="checkbox" checked'))

// Out-of-range index is a no-op rather than a throw or a wipe.
assert.equal(toggleNthHtmlCheckbox(html, 9), html)
assert.equal(toggleNthHtmlCheckbox('<p>no tasks</p>', 0), '<p>no tasks</p>')

console.log('page-body: all checks passed')
