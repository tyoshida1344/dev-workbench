// app/_lib/page.js のログインの案内と帯の切り替えのテスト。
// 要素は id で引くだけなので、hidden・textContent・disabled・onclick を持つ入れ物で差し替える。
// Googleのログインの部品(google)・location・sessionStorage・localStorage も差し替える。部品は読み込み済みにしておく。

import assert from 'node:assert/strict'
import { test } from 'node:test'

const SITE = 'https://example.test/dev-workbench/'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
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

const IDS = ['gate', 'gate-message', 'sign-in', 'gate-links', 'viewer', 'reauth', 'reauth-message', 'reauth-button', 'status']
const elements = new Map()
function resetElements() {
  for (const id of IDS) elements.set(id, { id, hidden: id !== 'gate' && id !== 'gate-message', textContent: '', disabled: false, onclick: null })
  elements.get('sign-in').textContent = 'Googleでログインして開く'
  elements.get('reauth-message').textContent = 'ログインの期限が切れました。'
  elements.get('reauth-button').textContent = 'Googleでログインし直す'
}
const $ = id => elements.get(id)

/** Googleのログインの部品。窓を開いた回数を opened に数え、respond・fail で結果を返す */
const google = { opened: 0, config: null }
define('google', {
  accounts: {
    oauth2: {
      initTokenClient(options) {
        google.config = options
        return { requestAccessToken: () => { google.opened++ } }
      },
      hasGrantedAllScopes: (response, scope) => String(response.scope ?? '').split(' ').includes(scope),
    },
  },
})
const respond = response => google.config.callback(response)
const fail = error => google.config.error_callback(error)

define('window', globalThis)
define('document', { getElementById: id => elements.get(id) ?? null })
define('sessionStorage', fakeStorage())
define('localStorage', fakeStorage())
define('history', { replaceState() {} })
define('location', new URL(`${SITE}design/?folder=${FOLDER}`))
define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })

const { sourceFromLocation, startViewer } = await import('../../app/_lib/page.js')

/** 約束の番を一巡りさせる */
const tick = () => new Promise(done => setTimeout(done))

function start() {
  sessionStorage.clear()
  localStorage.clear()
  resetElements()
}

test('トークンが無い時: ボタンを出し、押すと窓を開いて待つ表示にし、ログインできたら読む先を返す', async () => {
  start()
  const pending = sourceFromLocation({ sample: 'design' })
  await tick()
  assert.equal($('gate-message').textContent, 'Driveのフォルダを読むために、Googleでログインしてください。')
  assert.equal($('sign-in').hidden, false)
  assert.equal($('sign-in').textContent, 'Googleでログインして開く')

  const before = google.opened
  $('sign-in').onclick()
  assert.equal(google.opened, before + 1, '押した処理の中で、待たずに窓を開く')
  assert.equal($('gate-message').textContent, 'Googleのログインの窓で続けてください。')
  assert.equal($('sign-in').textContent, 'ログインの窓をもう一度開く')

  $('sign-in').onclick()
  assert.equal(google.opened, before + 2, 'もう一度押すと、窓をもう一度開く')

  respond({ access_token: 'token-1', expires_in: 3599, scope: DRIVE_SCOPE })
  const source = await pending
  assert.equal(source.token, 'token-1')
  assert.equal($('gate-message').textContent, '読み込み中...')
  assert.equal($('sign-in').hidden, true)
  assert.equal($('sign-in').textContent, 'Googleでログインして開く')
})

test('ボタンからのログインが失敗した時: わけと「Googleでログインして開く」を出し、押せばやり直せる', async () => {
  start()
  const pending = sourceFromLocation({ sample: 'design' })
  await tick()
  $('sign-in').onclick()
  fail({ type: 'popup_closed' })
  await tick()
  assert.equal($('gate-message').textContent, 'ログインの窓が閉じられました。読むにはもう一度ログインしてください。')
  assert.equal($('sign-in').hidden, false)
  assert.equal($('sign-in').textContent, 'Googleでログインして開く')

  $('sign-in').onclick()
  respond({ access_token: 'token-2', expires_in: 3599, scope: DRIVE_SCOPE })
  assert.equal((await pending).token, 'token-2')
})

test('期限内のトークンがある時: ボタンを出さずに読む先を返す', async () => {
  start()
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-3', expiresAt: Date.now() + 3_600_000 }))
  const source = await sourceFromLocation({ sample: 'design' })
  assert.equal(source.token, 'token-3')
  assert.equal($('sign-in').hidden, true)
})

test('一覧を出した後に切れた時: 帯でログインし直し、ページを移らずに新しいトークンで果たす', async () => {
  start()
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-4', expiresAt: Date.now() + 3_600_000 }))
  const source = await sourceFromLocation({ sample: 'design' })
  $('gate').hidden = true
  $('viewer').hidden = false

  const renewed = source.renew()
  await tick()
  assert.equal($('reauth').hidden, false)
  assert.equal($('reauth-message').textContent, 'ログインの期限が切れました。')
  assert.equal($('reauth-button').disabled, false)
  assert.equal(sessionStorage.getItem('workbench:token'), null, '切れたトークンは消す')

  $('reauth-button').onclick()
  assert.equal($('reauth-message').textContent, 'Googleのログインの窓で続けてください。')
  assert.equal($('reauth-button').textContent, 'ログインの窓をもう一度開く')
  fail({ type: 'popup_failed_to_open' })
  await tick()
  assert.equal($('reauth-message').textContent, 'ログインの窓が開けませんでした。このサイトのポップアップを許可してから、もう一度押してください。')
  assert.equal($('reauth-button').textContent, 'Googleでログインし直す')

  $('reauth-button').onclick()
  respond({ access_token: 'token-5', expires_in: 3599, scope: DRIVE_SCOPE })
  assert.equal(await renewed, 'token-5')
  assert.equal($('reauth').hidden, true)
  assert.equal($('viewer').hidden, false, 'ページは移らず、見ていたものもそのまま')
})

test('一覧を出す前に切れた時: 中ほどの案内で「ログインの期限が切れました。もう一度ログインしてください。」', async () => {
  start()
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-6', expiresAt: Date.now() + 3_600_000 }))
  const source = await sourceFromLocation({ sample: 'design' })
  const renewed = source.renew()
  await tick()
  assert.equal($('gate-message').textContent, 'ログインの期限が切れました。もう一度ログインしてください。')
  assert.equal($('sign-in').hidden, false)
  $('sign-in').onclick()
  respond({ access_token: 'token-7', expires_in: 3599, scope: DRIVE_SCOPE })
  assert.equal(await renewed, 'token-7')
})

test('startViewer: Driveのフォルダで見つからない時は、案内を出し、次のログインでアカウントを選べるようにする', async () => {
  start()
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-8', expiresAt: Date.now() + 3_600_000 }))
  const notFound = Object.assign(new Error('見つかりません。'), { code: 'not-found' })
  await startViewer({ sample: 'design', load: async () => { throw notFound } })
  assert.equal($('gate-message').textContent, '見つかりません。')
  assert.equal($('gate-links').hidden, false)
  assert.equal(localStorage.getItem('workbench:choose-account'), 'true')
})

test('startViewer: 見本で見つからない時は、アカウントの記憶を付けない', async () => {
  start()
  define('location', new URL(`${SITE}design/?folder=sample`))
  try {
    const notFound = Object.assign(new Error('見つかりません。'), { code: 'not-found' })
    await startViewer({ sample: 'design', load: async () => { throw notFound } })
    assert.equal(localStorage.getItem('workbench:choose-account'), null)
  }
  finally {
    define('location', new URL(`${SITE}design/?folder=${FOLDER}`))
  }
})

test('クライアントIDが空の時: わけとリンクを出し、ボタンは出さない', async () => {
  start()
  define('WORKBENCH_CONFIG', { googleClientId: '' })
  try {
    assert.equal(await sourceFromLocation({ sample: 'design' }), null)
    assert.equal($('gate-message').textContent, 'GoogleのクライアントIDが設定されていません(config.js)。')
    assert.equal($('sign-in').hidden, true)
    assert.equal($('gate-links').hidden, false)
  }
  finally {
    define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })
  }
})

test('前の版の HTML(帯の文言の場所が無い)と組み合わさっても、帯のボタンは押せる', async () => {
  start()
  elements.delete('reauth-message')
  try {
    sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-9', expiresAt: Date.now() + 3_600_000 }))
    const source = await sourceFromLocation({ sample: 'design' })
    $('gate').hidden = true
    $('viewer').hidden = false
    const renewed = source.renew()
    await tick()
    assert.equal($('reauth').hidden, false)
    assert.equal($('reauth-button').disabled, false)
    $('reauth-button').onclick()
    assert.equal($('reauth-button').textContent, 'ログインの窓をもう一度開く')
    respond({ access_token: 'token-10', expires_in: 3599, scope: DRIVE_SCOPE })
    assert.equal(await renewed, 'token-10')
  }
  finally {
    resetElements()
  }
})

test('帯: 押せるようになったらボタンへフォーカスを移し、ログインできたら元の所へ戻す', async () => {
  start()
  const focused = []
  const item = { id: 'item', isConnected: true, focus: () => focused.push('item') }
  $('reauth-button').focus = () => focused.push('reauth-button')
  define('document', { getElementById: id => elements.get(id) ?? null, activeElement: item })
  try {
    sessionStorage.setItem('workbench:token', JSON.stringify({ token: 'token-11', expiresAt: Date.now() + 3_600_000 }))
    const source = await sourceFromLocation({ sample: 'design' })
    $('gate').hidden = true
    $('viewer').hidden = false
    const renewed = source.renew()
    await tick()
    assert.deepEqual(focused, ['reauth-button'])
    $('reauth-button').onclick()
    respond({ access_token: 'token-12', expires_in: 3599, scope: DRIVE_SCOPE })
    await renewed
    assert.deepEqual(focused, ['reauth-button', 'item'])
  }
  finally {
    define('document', { getElementById: id => elements.get(id) ?? null })
  }
})
