// app/_lib/path.js(作業フォルダの中のパスの解決と、Web の URL の見分け)のテスト。

import assert from 'node:assert/strict'
import { test } from 'node:test'

const { isWebUrl, resolvePath } = await import('../../app/_lib/path.js')

test('resolvePath: 文書のフォルダから見た相対パスを、作業フォルダからのパスにする', () => {
  assert.equal(resolvePath('index.md', 'spec.md'), 'spec.md')
  assert.equal(resolvePath('spec/01_remove.md', 'images/a.svg'), 'spec/images/a.svg')
})

test('resolvePath: ./ と .. をたどる', () => {
  assert.equal(resolvePath('spec/01_remove.md', './02.md'), 'spec/02.md')
  assert.equal(resolvePath('spec/01_remove.md', '../index.md'), 'index.md')
  assert.equal(resolvePath('a/b/c.md', '../../x/./y.md'), 'x/y.md')
})

test('resolvePath: 作業フォルダの外へ出るものは null', () => {
  assert.equal(resolvePath('index.md', '../secret.md'), null)
  assert.equal(resolvePath('spec/01.md', '../../secret.md'), null)
  assert.equal(resolvePath('a/b.md', 'c/../../../d.md'), null)
})

test('resolvePath: % を解いて読む。壊れた % は null', () => {
  assert.equal(resolvePath('index.md', 'a%20b.md'), 'a b.md')
  assert.equal(resolvePath('index.md', '%E0%A4%A'), null)
  assert.equal(resolvePath('index.md', 'bad%zz.md'), null)
})

test('isWebUrl: http と https だけ(大文字小文字を区別しない)', () => {
  assert.equal(isWebUrl('http://example.com/'), true)
  assert.equal(isWebUrl('https://example.com/a?b#c'), true)
  assert.equal(isWebUrl('HTTPS://EXAMPLE.COM/'), true)
  assert.equal(isWebUrl('HttP://example.com/'), true)
})

test('isWebUrl: javascript:・data:・相対などは false', () => {
  for (const href of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'a.md', './a.md', '../a.md', '/a', '//example.com/', '#x', '']) {
    assert.equal(isWebUrl(href), false, href)
  }
})
