// app/_lib/drive.js のうち、外へ出るパスを読まないこと(UrlSource.file)と、
// 自分が始めたログインの戻りだけを受け取ること(finishSignIn)のテスト。
// fetch・location・history・sessionStorage・localStorage は、テストの中で差し替える。

import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const SITE = 'https://example.test/dev-workbench/'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const TOKEN = 'ya29.test-token'

/** sessionStorage・localStorage の差し替え */
function fakeStorage() {
  const map = new Map()
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    clear: () => map.clear(),
    values: () => [...map.values()],
  }
}

const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })

/** location の差し替え。replace・assign で移った先を moves に残す */
function fakeLocation(href) {
  const url = new URL(href)
  const moves = []
  return {
    moves,
    get href() { return url.href },
    get origin() { return url.origin },
    get pathname() { return url.pathname },
    get search() { return url.search },
    get hash() { return url.hash },
    replace: to => moves.push(String(to)),
    assign: to => moves.push(String(to)),
  }
}

/** history の差し替え。replaceState で書き換えた先を残す */
const history = { replaced: [], replaceState(_state, _title, url) { this.replaced.push(url) } }

define('window', globalThis)
define('sessionStorage', fakeStorage())
define('localStorage', fakeStorage())
define('history', history)
define('location', fakeLocation(`${SITE}design/`))

const { UrlSource, finishSignIn } = await import('../../app/_lib/drive.js')

/** fetch を差し替え、呼ばれた URL を数える */
function countFetch() {
  const calls = []
  define('fetch', async (url) => {
    calls.push(String(url))
    return new Response('中身', { status: 200 })
  })
  return calls
}

test('UrlSource.file: .. ・ . ・空の部分を含むパスは拒み、fetch を呼ばない', async () => {
  const calls = countFetch()
  const source = new UrlSource(`${SITE}sample/design`)
  for (const path of ['../secret.md', 'a/../../b.md', '..', './a.md', 'a/./b.md', '.', '', 'a//b.md', '/a.md', 'a/']) {
    await assert.rejects(source.file(path), undefined, JSON.stringify(path))
  }
  assert.deepEqual(calls, [])
})

test('UrlSource.file: フォルダの中のパスは、base の下の URL を読む', async () => {
  const calls = countFetch()
  const source = new UrlSource(`${SITE}sample/design`)
  const response = await source.file('spec/01 remove.md')
  assert.equal(await response.text(), '中身')
  assert.deepEqual(calls, [`${SITE}sample/design/spec/01%20remove.md`])
})

/** ログインを始めた時の約束を置き、Google から戻ってきた auth/ のページにする */
function returnFromGoogle({ nonce = 'nonce-1', back = `${SITE}design/?folder=abc`, hash }) {
  sessionStorage.clear()
  localStorage.clear()
  history.replaced.length = 0
  sessionStorage.setItem('workbench:sign-in', JSON.stringify({ nonce, back, silent: false }))
  const location = fakeLocation(`${SITE}auth/#${new URLSearchParams(hash)}`)
  define('location', location)
  return location
}

const tokenSaved = () => [...sessionStorage.values(), ...localStorage.values()].some(value => value.includes(TOKEN))

beforeEach(() => define('location', fakeLocation(`${SITE}design/`)))

test('finishSignIn: 自分が始めたログインの戻りなら、トークンを置いて元のページへ戻す', () => {
  const location = returnFromGoogle({ hash: { state: 'nonce-1', access_token: TOKEN, expires_in: '3600', scope: DRIVE_SCOPE } })
  const outcome = finishSignIn()
  assert.equal(outcome.ok, true)
  assert.equal(tokenSaved(), true)
  assert.deepEqual(location.moves, [`${SITE}design/?folder=abc`])
  // トークンを履歴に残さない
  assert.ok(history.replaced.length > 0 && history.replaced.every(url => !String(url).includes(TOKEN)))
})

test('finishSignIn: state が食い違う戻りは受け取らない', () => {
  const location = returnFromGoogle({ hash: { state: 'someone-else', access_token: TOKEN, expires_in: '3600', scope: DRIVE_SCOPE } })
  const outcome = finishSignIn()
  assert.notEqual(outcome?.ok, true)
  assert.equal(tokenSaved(), false)
  assert.deepEqual(location.moves, [])
})

test('finishSignIn: 始めた約束が無い戻りは受け取らない', () => {
  const location = returnFromGoogle({ hash: { state: 'nonce-1', access_token: TOKEN, expires_in: '3600', scope: DRIVE_SCOPE } })
  sessionStorage.clear()
  const outcome = finishSignIn()
  assert.notEqual(outcome?.ok, true)
  assert.equal(tokenSaved(), false)
  assert.deepEqual(location.moves, [])
})

test('finishSignIn: オリジンの違う戻り先へは戻さない', () => {
  for (const back of ['https://evil.example/steal', '//evil.example/steal', 'http://example.test/dev-workbench/design/', 'javascript:alert(1)']) {
    const location = returnFromGoogle({ back, hash: { state: 'nonce-1', access_token: TOKEN, expires_in: '3600', scope: DRIVE_SCOPE } })
    const outcome = finishSignIn()
    assert.notEqual(outcome?.ok, true, back)
    assert.equal(tokenSaved(), false, back)
    assert.deepEqual(location.moves, [], back)
  }
})

test('finishSignIn: Drive を見る許可が足りない scope は受け取らない', () => {
  for (const scope of ['', 'email profile', 'https://www.googleapis.com/auth/drive.metadata.readonly']) {
    returnFromGoogle({ hash: { state: 'nonce-1', access_token: TOKEN, expires_in: '3600', scope } })
    const outcome = finishSignIn()
    assert.notEqual(outcome?.ok, true, scope)
    assert.equal(tokenSaved(), false, scope)
  }
})
