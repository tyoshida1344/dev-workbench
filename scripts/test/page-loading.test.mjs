// app/_lib/page.js のうち、Googleのログインの部品をまだ読み込み中の時の案内と帯のテスト。
// 部品の読み込みの結果は、読み込み直すまで覚えている(drive.js)ので、ほかの場合とは別のファイルにする。

import assert from 'node:assert/strict'
import { test } from 'node:test'

const SITE = 'https://example.test/dev-workbench/'
const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
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

/** 部品の <script> は、テストが onload を呼ぶまで読み込み中のままにする */
const scripts = []
define('window', globalThis)
define('document', {
  getElementById: id => elements.get(id) ?? null,
  createElement: tag => ({ tagName: tag }),
  head: { append: node => scripts.push(node) },
})
define('sessionStorage', fakeStorage())
define('localStorage', fakeStorage())
define('history', { replaceState() {} })
define('location', new URL(`${SITE}design/?folder=${FOLDER}`))
define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })

const { sourceFromLocation } = await import('../../app/_lib/page.js')
const tick = () => new Promise(done => setTimeout(done))

test('一覧を出した後に切れた時、部品がまだ読み込み中なら、帯のボタンを押せない形で出し、読み終えたら押せるようにする', async () => {
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-1', expiresAt: Date.now() + 3_600_000 }))
  const source = await sourceFromLocation({ sample: 'design' })
  $('viewer').hidden = false
  source.renew()
  await tick()
  assert.equal($('reauth').hidden, false)
  assert.equal($('reauth-message').textContent, 'ログインの期限が切れました。')
  assert.equal($('reauth-button').disabled, true)
  assert.equal($('reauth-button').hidden, false)

  define('google', { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }), hasGrantedAllScopes: () => true } } })
  scripts[0].onload()
  await tick()
  assert.equal($('reauth-button').disabled, false)
  assert.equal(typeof $('reauth-button').onclick, 'function')
})

test('トークンが無い時、部品を読み終えるまでは「読み込み中...」で、ボタンを出さない', async () => {
  // 部品は上のテストで読み込み済みなので、読み終えた後の表示だけを確かめる(読み込み中の表示は、上で読み込む前に出している)
  sessionStorage.clear()
  $('viewer').hidden = true
  sourceFromLocation({ sample: 'design' })
  assert.equal($('gate-message').textContent, '読み込み中...')
  assert.equal($('sign-in').hidden, true)
  await tick()
  assert.equal($('gate-message').textContent, 'Driveのフォルダを読むために、Googleでログインしてください。')
  assert.equal($('sign-in').hidden, false)
})
