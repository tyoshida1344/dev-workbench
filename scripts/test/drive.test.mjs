// app/_lib/drive.js のうち、外へ出るパスを読まないこと(UrlSource.file)と、
// Googleのログインの窓の結果の扱い(signIn)・部品の読み込み(loadSignIn)・トークンの用意(driveToken)・読み込んだ時の片付けのテスト。
// fetch・location・history・sessionStorage・localStorage・document・google(ログインの部品)は、テストの中で差し替える。

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

const { UrlSource } = await import('../../app/_lib/drive.js')

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

const tokenSaved = () => [...sessionStorage.values(), ...localStorage.values()].some(value => value.includes(TOKEN))

/** Google のログインの部品の差し替え。requestAccessToken に渡した値を calls に残し、respond・fail で窓の結果を返す */
function fakeGoogle() {
  const calls = []
  let config = null
  const oauth2 = {
    initTokenClient(options) {
      config = options
      return { requestAccessToken: options2 => calls.push(options2) }
    },
    hasGrantedAllScopes: (response, scope) => String(response.scope ?? '').split(' ').includes(scope),
  }
  define('google', { accounts: { oauth2 } })
  return {
    calls,
    get config() { return config },
    respond: response => config.callback(response),
    fail: error => config.error_callback(error),
  }
}

/** 読み込むたびに新しい drive.js(関数の中に覚えている窓・部品の状態を持ち越さない) */
let loads = 0
const freshDrive = () => import(`../../app/_lib/drive.js?test=${++loads}`)

/** document の差し替え。作った要素を appended に残す */
function fakeDocument() {
  const appended = []
  define('document', { createElement: tag => ({ tagName: tag }), head: { append: node => appended.push(node) } })
  return appended
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  history.replaced.length = 0
  define('location', fakeLocation(`${SITE}design/`))
  define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })
  define('google', undefined)
})

test('読み込んだ時: 前の版のログインの記録を消し、トークンは残す', async () => {
  localStorage.setItem('workbench:signed-in', 'true')
  localStorage.setItem('evidence-viewer:signed-in', 'true')
  sessionStorage.setItem('workbench:sign-in', JSON.stringify({ nonce: 'n' }))
  sessionStorage.setItem('workbench:sign-in-result', JSON.stringify({ ok: true }))
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: TOKEN, expiresAt: Date.now() + 3_600_000 }))
  await freshDrive()
  assert.equal(localStorage.getItem('workbench:signed-in'), null)
  assert.equal(localStorage.getItem('evidence-viewer:signed-in'), null)
  assert.equal(sessionStorage.getItem('workbench:sign-in'), null)
  assert.equal(sessionStorage.getItem('workbench:sign-in-result'), null)
  assert.ok(tokenSaved())
})

test('読み込んだ時: URL の # にトークンがあれば、使わずに履歴から消す', async () => {
  define('location', fakeLocation(`${SITE}design/?folder=abc#access_token=${TOKEN}&expires_in=3600`))
  const { driveToken } = await freshDrive()
  assert.deepEqual(history.replaced, ['/dev-workbench/design/?folder=abc'])
  assert.ok(driveToken().ask)
  assert.ok(!tokenSaved())
})

test('driveToken: クライアントIDが空ならエラー、期限まで1分より長いトークンだけを使い、無ければボタンの案内', async () => {
  const { driveToken } = await freshDrive()
  define('WORKBENCH_CONFIG', { googleClientId: '' })
  assert.deepEqual(driveToken(), { error: 'GoogleのクライアントIDが設定されていません(config.js)。' })
  define('WORKBENCH_CONFIG', { googleClientId: 'client-1' })
  assert.deepEqual(driveToken(), { ask: 'Driveのフォルダを読むために、Googleでログインしてください。' })
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: TOKEN, expiresAt: Date.now() + 61_000 }))
  assert.deepEqual(driveToken(), { token: TOKEN })
  sessionStorage.setItem('workbench:token', JSON.stringify({ token: TOKEN, expiresAt: Date.now() + 59_000 }))
  assert.ok(driveToken().ask)
})

test('signIn: 窓でログインできたら、トークンと期限をタブに置き、アカウントを選ばせるしるしを消す', async () => {
  const google = fakeGoogle()
  const { signIn, driveToken } = await freshDrive()
  localStorage.setItem('workbench:choose-account', 'true')
  const result = signIn()
  assert.equal(google.config.client_id, 'client-1')
  assert.equal(google.config.scope, DRIVE_SCOPE)
  google.respond({ access_token: TOKEN, expires_in: 3599, scope: DRIVE_SCOPE })
  assert.deepEqual(await result, { token: TOKEN })
  assert.deepEqual(driveToken(), { token: TOKEN })
  assert.equal(localStorage.getItem('workbench:choose-account'), null)
})

test('signIn: Drive を読む許可が無いトークンは置かない', async () => {
  const google = fakeGoogle()
  const { signIn } = await freshDrive()
  const result = signIn()
  google.respond({ access_token: TOKEN, expires_in: 3599, scope: 'email profile' })
  assert.deepEqual(await result, { error: 'ログインの時に、Driveのファイルを見る許可にチェックを付けてください。' })
  assert.ok(!tokenSaved())
})

test('signIn: Google が返したエラーのコードと、窓の知らせを、文言にする', async () => {
  const cases = [
    [g => g.respond({ error: 'invalid_client' }), 'このサイトのGoogleでのログインの設定が正しくありません(config.js のクライアントID)。'],
    [g => g.respond({ error: 'temporarily_unavailable' }), 'Googleのログインが一時的に使えませんでした。少し待ってから、もう一度ログインしてください。'],
    [g => g.respond({ error: 'access_denied' }), 'ログインできませんでした。もう一度ログインしてください。'],
    [g => g.respond({}), 'ログインできませんでした。もう一度ログインしてください。'],
    [g => g.fail({ type: 'popup_closed' }), 'ログインの窓が閉じられました。読むにはもう一度ログインしてください。'],
    [g => g.fail({ type: 'popup_failed_to_open' }), 'ログインの窓が開けませんでした。このサイトのポップアップを許可してから、もう一度押してください。'],
    [g => g.fail({ type: 'unknown' }), 'ログインできませんでした。もう一度ログインしてください。'],
  ]
  for (const [act, message] of cases) {
    const google = fakeGoogle()
    const { signIn } = await freshDrive()
    const result = signIn()
    act(google)
    assert.deepEqual(await result, { error: message })
    assert.ok(!tokenSaved())
  }
})

test('signIn: 窓を開いている間にもう一度呼ぶと、窓をもう一度開き、同じ約束を返す', async () => {
  const google = fakeGoogle()
  const { signIn } = await freshDrive()
  const first = signIn()
  const second = signIn()
  assert.equal(first, second)
  assert.equal(google.calls.length, 2)
  google.fail({ type: 'popup_closed' })
  assert.ok((await first).error)
  // 終わった後にもう一度呼べば、新しい約束になる
  assert.notEqual(signIn(), first)
})

test('signIn: ふだんはアカウントを選ぶ画面を出さず、見つからない時の案内の後と、保存が使えない時は出す', async () => {
  const google = fakeGoogle()
  const { signIn, rememberWrongAccount } = await freshDrive()
  signIn()
  assert.equal(google.calls.at(-1).prompt, '')
  google.fail({ type: 'popup_closed' })

  rememberWrongAccount()
  signIn()
  assert.equal(google.calls.at(-1).prompt, 'select_account')
  google.respond({ access_token: TOKEN, expires_in: 3599, scope: DRIVE_SCOPE })
  await new Promise(done => setTimeout(done))
  signIn()
  assert.equal(google.calls.at(-1).prompt, '', 'ログインできたら、しるしは消える')
  google.fail({ type: 'popup_closed' })

  // アカウントを選ぶ画面で窓を閉じた時は、しるしを残し、次もまた選ぶ画面を出す
  rememberWrongAccount()
  signIn()
  google.fail({ type: 'popup_closed' })
  await new Promise(done => setTimeout(done))
  signIn()
  assert.equal(google.calls.at(-1).prompt, 'select_account', '窓を閉じても、ログインできるまでは選ぶ画面を出す')
  google.respond({ access_token: TOKEN, expires_in: 3599, scope: DRIVE_SCOPE })
  await new Promise(done => setTimeout(done))

  const broken = fakeStorage()
  broken.setItem = () => { throw new Error('保存が使えない') }
  define('localStorage', broken)
  try {
    signIn()
    assert.equal(google.calls.at(-1).prompt, 'select_account')
  }
  finally {
    define('localStorage', fakeStorage())
  }
})

test('loadSignIn: 部品を1回だけ読み込み、読み込めたら果たす', async () => {
  const appended = fakeDocument()
  const { loadSignIn } = await freshDrive()
  const first = loadSignIn()
  assert.equal(loadSignIn(), first)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].tagName, 'script')
  assert.equal(appended[0].src, 'https://accounts.google.com/gsi/client')
  fakeGoogle()
  appended[0].onload()
  await first
})

test('loadSignIn: 読み込めない時は、部品を読み込めなかったエラーで終わり、開き直すまで同じ結果を返す', async () => {
  const appended = fakeDocument()
  const { loadSignIn } = await freshDrive()
  const first = loadSignIn()
  appended[0].onerror()
  await assert.rejects(first, { code: 'sign-in-unavailable', message: 'Googleのログインの部品を読み込めませんでした。ネットワークと、広告やスクリプトを止める拡張機能を確かめてから、開き直してください。' })
  assert.equal(loadSignIn(), first)
  assert.equal(appended.length, 1)
})

test('loadSignIn: 20秒で読み込みが終わらなければ、読み込めなかったとして扱う', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  fakeDocument()
  const { loadSignIn } = await freshDrive()
  let failed = null
  loadSignIn().catch((error) => { failed = error })
  t.mock.timers.tick(19_999)
  await Promise.resolve()
  assert.equal(failed, null)
  t.mock.timers.tick(1)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(failed?.code, 'sign-in-unavailable')
})

test('loadSignIn: 読み込めても部品が使えない時は、読み込めなかったとして扱う', async () => {
  const appended = fakeDocument()
  const { loadSignIn } = await freshDrive()
  const first = loadSignIn()
  appended[0].onload()
  await assert.rejects(first, { code: 'sign-in-unavailable' })
})

test('前の版のファイルのために、前の版が読み込む名前を書き出し続ける', async () => {
  const drive = await freshDrive()
  for (const name of ['DriveSource', 'UrlSource', 'driveToken', 'forgetToken', 'goToSignIn', 'finishSignIn']) {
    assert.equal(typeof drive[name], 'function', name)
  }
})

test('goToSignIn(前の版の page.js から): ページを読み直すだけで、Google へは移らない', async () => {
  const location = fakeLocation(`${SITE}design/?folder=abc`)
  let reloaded = 0
  location.reload = () => { reloaded++ }
  define('location', location)
  const { goToSignIn } = await freshDrive()
  goToSignIn(location.href)
  assert.equal(reloaded, 1)
  assert.deepEqual(location.moves, [])
})

test('finishSignIn(前の版の auth/ から): 戻す先は無いとし、URL のトークンは受け取らずに消す', async () => {
  define('location', fakeLocation(`${SITE}auth/#state=n&access_token=${TOKEN}&expires_in=3600&scope=${encodeURIComponent(DRIVE_SCOPE)}`))
  const { finishSignIn, driveToken } = await freshDrive()
  assert.deepEqual(finishSignIn(), { lost: true })
  assert.deepEqual(history.replaced, ['/dev-workbench/auth/'])
  assert.ok(!tokenSaved())
  assert.ok(driveToken().ask)
})

/** トークンごとに答えを返し分ける fetch。送った Authorization を sent に残す */
function fetchByToken(answers) {
  const sent = []
  define('fetch', async (_url, { headers }) => {
    const token = headers.Authorization.replace('Bearer ', '')
    sent.push(token)
    return answers[token]()
  })
  return sent
}
const reply = status => () => new Response(status === 200 ? '中身' : '{}', { status })

test('DriveSource: 同時に断られた読み込みは1回のログインを待ち、新しいトークンで送り直す', async () => {
  const { DriveSource } = await freshDrive()
  const sent = fetchByToken({ old: reply(401), fresh: reply(200) })
  let renews = 0
  let finish
  const source = new DriveSource('folder', 'old', () => {
    renews++
    return new Promise((done) => { finish = done })
  })
  const a = source.request('https://www.googleapis.com/drive/v3/files/a')
  const b = source.request('https://www.googleapis.com/drive/v3/files/b')
  await new Promise(done => setTimeout(done))
  assert.equal(renews, 1)
  finish('fresh')
  assert.equal((await a).status, 200)
  assert.equal((await b).status, 200)
  assert.deepEqual(sent.filter(token => token === 'fresh').length, 2)
})

test('DriveSource: ログインし直した後に古いトークンの 401 が返っても、もう一度ログインを求めずに送り直す', async () => {
  const { DriveSource } = await freshDrive()
  let late
  define('fetch', async (_url, { headers }) => {
    const token = headers.Authorization.replace('Bearer ', '')
    if (token === 'fresh') return new Response('中身', { status: 200 })
    // 古いトークンの2つ目の答えは、ログインし直した後に返す
    return late ? new Promise((done) => { late.push(done) }) : new Response('{}', { status: 401 })
  })
  let renews = 0
  const source = new DriveSource('folder', 'old', async () => {
    renews++
    return 'fresh'
  })
  late = null
  const first = source.request('https://www.googleapis.com/drive/v3/files/a')
  late = []
  const second = source.request('https://www.googleapis.com/drive/v3/files/b')
  assert.equal((await first).status, 200)
  assert.equal(renews, 1)
  for (const done of late) done(new Response('{}', { status: 401 }))
  assert.equal((await second).status, 200)
  assert.equal(renews, 1, '古い 401 では、ログインし直さない')
})
