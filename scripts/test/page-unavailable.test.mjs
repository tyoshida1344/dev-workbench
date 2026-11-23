// app/_lib/page.js のうち、Googleのログインの部品を読み込めなかった時の案内と帯のテスト。
// 部品の読み込みの結果は、読み込み直すまで覚えている(drive.js)ので、読み込めた時のテスト(page.test.mjs)とは別のファイルにする。

import assert from 'node:assert/strict'
import { test } from 'node:test'

const SITE = 'https://example.test/dev-workbench/'
const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const UNAVAILABLE = 'Googleのログインの部品を読み込めませんでした。ネットワークと、広告やスクリプトを止める拡張機能を確かめてから、開き直してください。'
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })

function fakeStorage() {
  const map = new Map()
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    clear: () => map.clear(),
  }
}

const elements = new Map()
for (const id of ['gate', 'gate-message', 'sign-in', 'gate-links', 'viewer', 'reauth', 'reauth-message', 'reauth-button']) {
  elements.set(id, { id, hidden: true, textContent: '', disabled: false, onclick: null })
}
const $ = id => elements.get(id)

/** 部品の <script> は、読み込めなかったことにする */
const scripts = []
define('window', globalThis)
define('document', {
  getElementById: id => elements.get(id) ?? null,
  createElement: tag => ({ tagName: tag }),
  head: { append: (node) => { scripts.push(node); setTimeout(() => node.onerror()) } },
})
define('sessionStorage', fakeStorage())
define('localStorage', fakeStorage())
define('history', { replaceState() {} })
define('location', new URL(`${SITE}design/?folder=${FOLDER}`))
define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })

const { sourceFromLocation } = await import('../../app/_lib/page.js')
const tick = () => new Promise(done => setTimeout(done, 5))

test('期限内のトークンがある時: 部品を読み込めなくても何も出さず、読む先を返す。期限が切れた時に、帯でわけを出してボタンを隠す', async () => {
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-1', expiresAt: Date.now() + 3_600_000 }))
  const source = await sourceFromLocation({ sample: 'design' })
  assert.equal(source.token, 'token-1')
  await tick()
  assert.equal(scripts.length, 1)
  assert.equal($('gate-message').textContent, '', '期限内なら、部品を読み込めなくても何も出さない')
  assert.equal($('reauth').hidden, true)

  $('viewer').hidden = false
  source.renew()
  await tick()
  assert.equal($('reauth').hidden, false)
  assert.equal($('reauth-message').textContent, UNAVAILABLE)
  assert.equal($('reauth-button').hidden, true)
})

test('トークンが無い時: 部品を読み込めなければ、わけとリンクを出し、ボタンは出さない', async () => {
  sessionStorage.clear()
  $('viewer').hidden = true
  sourceFromLocation({ sample: 'design' })
  await tick()
  assert.equal($('gate-message').textContent, UNAVAILABLE)
  assert.equal($('sign-in').hidden, true)
  assert.equal($('gate-links').hidden, false)
})
