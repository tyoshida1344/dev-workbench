// 道具が共通で使う、Googleでのログインと、Drive・URLからの読み込み。
//
// ログインは、Googleのログインの部品(Google Identity Services)が開く窓で行い、トークンを窓からページの中へ直に受け取る。
// トークンはURLに乗らない。ページも移らない。窓はボタンを押した操作の中でしか開けない(押した操作の無い時はブラウザに止められる)ので、
// 部品はボタンを押せるようにする前に読み込んでおき、押した処理の中で待たずに窓を開く。
// トークンはタブの中(sessionStorage)に、期限まで置く。道具をまたいで同じトークンを使う。
//
// 書き出す名前を消したり変えたりしない。ブラウザのキャッシュに残った前の版の page.js・auth.js が、新しい版の drive.js を読み込むことがあり、
// 名前が無いとビューアが始まらなくなる(残している名前は末尾の goToSignIn・finishSignIn の所。テストでも確かめる)。

import { lookup } from './path.js'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
/** Googleのログインの部品。CLAUDE.md の「外部のスクリプトを読み込まない」の、ただ1つの例外 */
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client'
/** 部品の読み込みを待つ長さ。過ぎたら読み込めなかったとして扱う */
const LOAD_TIMEOUT = 20_000
const FOLDER = 'application/vnd.google-apps.folder'
/** 受け取ったトークン。タブの中(sessionStorage)にだけ、期限まで置く */
const TOKEN_KEY = 'workbench:token'
/** Driveのフォルダで見つからない時の案内が出たしるし(localStorage)。あれば、次のログインでアカウントを選ぶ画面を出す */
const CHOOSE_ACCOUNT_KEY = 'workbench:choose-account'
/** 前の版が残した記録。今は使わないので、読み込んだ時に消す */
const OLD_KEYS = [
  ['localStorage', 'workbench:signed-in'],
  ['localStorage', 'evidence-viewer:signed-in'],
  ['sessionStorage', 'workbench:sign-in'],
  ['sessionStorage', 'workbench:sign-in-result'],
]

/** ログインできなかった時に、画面に出す言葉 */
export const SIGN_IN_MESSAGES = {
  closed: 'ログインの窓が閉じられました。読むにはもう一度ログインしてください。',
  blocked: 'ログインの窓が開けませんでした。このサイトのポップアップを許可してから、もう一度押してください。',
  unavailable: 'Googleのログインの部品を読み込めませんでした。ネットワークと、広告やスクリプトを止める拡張機能を確かめてから、開き直してください。',
  other: 'ログインできませんでした。もう一度ログインしてください。',
}
/** Googleが返したエラーのコードを、画面に出す言葉にする(同意の画面で断ると、窓が閉じられた時と同じ知らせになるので、ここには来ない) */
const SIGN_IN_ERRORS = {
  scope: 'ログインの時に、Driveのファイルを見る許可にチェックを付けてください。',
  invalid_client: 'このサイトのGoogleでのログインの設定が正しくありません(config.js のクライアントID)。',
  unauthorized_client: 'このサイトのGoogleでのログインの設定が正しくありません(config.js のクライアントID)。',
  server_error: 'Googleのログインが一時的に使えませんでした。少し待ってから、もう一度ログインしてください。',
  temporarily_unavailable: 'Googleのログインが一時的に使えませんでした。少し待ってから、もう一度ログインしてください。',
}
/** Driveが返したエラーの理由を、画面に出す言葉にする */
const DRIVE_ERRORS = {
  accessNotConfigured: 'Google Cloudで、DriveのAPIが有効になっていません。',
  insufficientPermissions: 'Driveのファイルを見る許可がありません。もう一度ログインして、許可にチェックを付けてください。',
  rateLimitExceeded: 'Driveへの読み込みが多すぎました。少し待ってから開き直してください。',
  userRateLimitExceeded: 'Driveへの読み込みが多すぎました。少し待ってから開き直してください。',
}

/** ブラウザの保存先('sessionStorage' か 'localStorage')。使えない設定もあるので、失敗しても止まらないようにする */
const store = {
  get(storage, key) {
    try {
      return JSON.parse(window[storage].getItem(key))
    }
    catch {
      return null
    }
  },
  /** 置けたら true(保存が使えない設定では false) */
  set(storage, key, value) {
    try {
      if (value === null) window[storage].removeItem(key)
      else window[storage].setItem(key, JSON.stringify(value))
      return true
    }
    catch {
      return false
    }
  },
}

// 前の版から移る人のために。
// 前の版のログインの記録(画面を出さずにログインし直すしるし、auth/ を通るログインの途中の記録)を消す。
for (const [storage, key] of OLD_KEYS) store.set(storage, key, null)
// 前の版のタブや履歴から、# にトークンが付いたURLで開かれることがある。使わずに、アドレスバーと履歴から消す。
if (new URLSearchParams(location.hash.slice(1)).has('access_token')) {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}

/** エラーを作る。code は、呼んだ側が言葉を選ぶための印('not-found' など) */
function failure(message, code) {
  return Object.assign(new Error(message), { code })
}

/**
 * Map に、作った約束(make())を覚えておく。同じ key は同じ約束を返す。
 * 失敗した約束は覚えておかず、次に呼んだ時に作り直す(読めなかったものを、もう一度押せば読み直せる)。
 */
function memo(map, key, make) {
  if (!map.has(key)) {
    const promise = new Promise(resolve => resolve(make()))
    map.set(key, promise)
    promise.catch(() => {
      if (map.get(key) === promise) map.delete(key)
    })
  }
  return map.get(key)
}

/** Driveが返したエラーを、言葉にする */
async function driveError(response) {
  let reason = ''
  try {
    const { error } = await response.json()
    reason = error.details?.find(detail => detail.reason)?.reason ?? error.errors?.[0]?.reason ?? ''
  }
  catch {}
  if (response.status === 404 || reason === 'notFound') return failure('Driveにファイルが見つかりません。', 'not-found')
  if (lookup(DRIVE_ERRORS, reason)) return failure(lookup(DRIVE_ERRORS, reason))
  return failure(`Driveから読めませんでした(${response.status})。`)
}

/** 読んだファイルを、画像や動画として出せるURLにする */
async function blobUrl(response, path) {
  const blob = await response.blob()
  // Driveは .svg を image/svg+xml で返さないことがある。画像として出せるよう、種類を付け直す。
  return URL.createObjectURL(/\.svg$/i.test(path) ? new Blob([blob], { type: 'image/svg+xml' }) : blob)
}

/**
 * Driveのフォルダから読む。ログインした人がもともと見られるファイルだけが読める。パスは / で区切る。
 * URLから読む UrlSource と同じく、file(path)・text(path)・url(path)・release(path) を持つ。
 */
export class DriveSource {
  /** renew は、トークンが切れた時に新しいトークンを返す(ログインし直してもらう) */
  constructor(folderId, token, renew) {
    this.folderId = folderId
    this.token = token
    this.renew = renew
    this.renewing = null
    /** フォルダのID → その中身(名前 → { id, name, folder, modifiedTime })の約束 */
    this.folders = new Map()
    /** パス → 本文の約束 */
    this.texts = new Map()
    /** パス → blob の URL の約束 */
    this.urls = new Map()
  }

  async request(url) {
    const send = () => fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    const sent = this.token
    let response = await send()
    if (response.status === 401) {
      // アクセストークンは1時間ほどで切れる。同時に切れたことに気づいた読み込みは、同じログインを待つ。
      // 古いトークンで送った答えが、ログインし直した後に返ってきた時は、ログインし直さずに新しいトークンで送り直す。
      // renew は、ログインできるまで果たさない(失敗しても断らない)ので、止まっていた読み込みは、ログインできた時に続く。
      if (this.token === sent) {
        this.renewing ??= this.renew().then((token) => { this.token = token }).finally(() => { this.renewing = null })
      }
      await this.renewing
      response = await send()
    }
    if (!response.ok) throw await driveError(response)
    return response
  }

  /** いくつかのフォルダの中身を、1回の問い合わせで読む。フォルダのID → (名前 → 中身の1つ) */
  async children(folderIds) {
    const q = encodeURIComponent(`(${folderIds.map(id => `'${id}' in parents`).join(' or ')}) and trashed = false`)
    const result = new Map(folderIds.map(id => [id, new Map()]))
    let pageToken = ''
    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,parents)&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`
        + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      const page = await (await this.request(url)).json()
      for (const file of page.files ?? []) {
        const entry = { id: file.id, name: file.name, folder: file.mimeType === FOLDER, modifiedTime: file.modifiedTime }
        for (const parent of file.parents ?? []) {
          const entries = result.get(parent)
          // 同じ名前が2つあると、どちらを読めばよいか決められない。黙ってどちらかを読まず、引いた時にエラーにする。
          entries?.set(file.name, entries.has(file.name) ? { name: file.name, duplicate: true } : entry)
        }
      }
      pageToken = page.nextPageToken
    } while (pageToken)
    return result
  }

  entriesOf(folderId) {
    return memo(this.folders, folderId, async () => (await this.children([folderId])).get(folderId))
  }

  /** パス(a/b/c.md)のもの。無ければ null。同じ名前が2つあればエラー */
  async find(path) {
    let entry = { id: this.folderId, folder: true }
    for (const name of path.split('/').filter(Boolean)) {
      if (!entry.folder) return null
      entry = (await this.entriesOf(entry.id)).get(name)
      if (!entry) return null
      if (entry.duplicate) throw failure(`同じ名前のファイルが2つあります: ${name}`)
    }
    return entry
  }

  /** フォルダの中身。名前の順に { name, id, folder, modifiedTime } を返す。無ければ空 */
  async list(path = '') {
    const entry = await this.find(path)
    if (!entry?.folder) return []
    return [...(await this.entriesOf(entry.id)).values()]
  }

  /** いくつかのフォルダ(パス)の中身を、まとめて1回で読んで、それぞれの list() を返す */
  async listMany(paths) {
    const entries = await Promise.all(paths.map(path => this.find(path)))
    const ids = [...new Set(entries.filter(entry => entry?.folder && !this.folders.has(entry.id)).map(entry => entry.id))]
    if (ids.length) {
      const all = this.children(ids)
      for (const id of ids) memo(this.folders, id, async () => (await all).get(id))
    }
    return Promise.all(paths.map(path => this.list(path)))
  }

  async file(path) {
    const entry = await this.find(path)
    if (!entry || entry.folder) throw failure(`フォルダに ${path} がありません。`, 'not-found')
    return this.request(`${DRIVE_API}/files/${entry.id}?alt=media&supportsAllDrives=true`)
  }

  text(path) {
    return memo(this.texts, path, async () => (await this.file(path)).text())
  }

  /** 画像や動画として出せるURL(blob の URL)。要らなくなったら release(path) で放す */
  url(path) {
    return memo(this.urls, path, async () => blobUrl(await this.file(path), path))
  }

  /** url(path) で作った blob の URL を放す(メモリを返す) */
  release(path) {
    const url = this.urls.get(path)
    if (!url) return
    this.urls.delete(path)
    url.then(URL.revokeObjectURL, () => {})
  }
}

/** URLから読む。見本(?folder=sample の時の <サイト>/sample/<道具>/)を読む。フォルダの中身は一覧できない */
export class UrlSource {
  constructor(base) {
    this.base = base.endsWith('/') ? base : `${base}/`
    /** パス → 本文の約束 */
    this.texts = new Map()
  }

  /** パスのURL。読むのは base のフォルダの中だけ。.. や空の部分で外へ出るパスは読まない(Drive から読む時と同じ範囲にする) */
  target(path) {
    const parts = String(path).split('/')
    if (parts.some(part => part === '' || part === '.' || part === '..')) throw failure(`フォルダの外は読めません: ${path}`)
    return new URL(parts.map(encodeURIComponent).join('/'), this.base).href
  }

  async file(path) {
    const response = await fetch(this.target(path))
    if (response.status === 404) throw failure(`${path} が見つかりません。`, 'not-found')
    if (!response.ok) throw failure(`${path} を読めませんでした(${response.status})。`)
    return response
  }

  text(path) {
    return memo(this.texts, path, async () => (await this.file(path)).text())
  }

  /** 画像や動画として出せるURL。読まずに、そのファイルのURLを返す */
  async url(path) {
    return this.target(path)
  }

  /** blob の URL を作らないので、放すものは無い */
  release() {}
}

/** 期限まで1分以上あるトークン。無ければ null */
function savedToken() {
  const saved = store.get('sessionStorage', TOKEN_KEY)
  return saved?.token && saved.expiresAt - Date.now() > 60_000 ? saved.token : null
}

let loading = null

/**
 * Googleのログインの部品を読み込む。1回だけ読み込み、2回目からは同じ約束を返す(読み込めなかった時も、開き直すまで同じ)。
 * 読み込めない時と、LOAD_TIMEOUT で終わらない時は、code が 'sign-in-unavailable' のエラーで終わる。
 */
export function loadSignIn() {
  loading ??= new Promise((resolve, reject) => {
    const ready = () => Boolean(window.google?.accounts?.oauth2)
    if (ready()) {
      resolve()
      return
    }
    const fail = () => reject(failure(SIGN_IN_MESSAGES.unavailable, 'sign-in-unavailable'))
    const timer = setTimeout(fail, LOAD_TIMEOUT)
    const script = document.createElement('script')
    script.src = SIGN_IN_SCRIPT
    script.async = true
    script.onload = () => {
      clearTimeout(timer)
      if (ready()) resolve()
      else fail()
    }
    script.onerror = () => {
      clearTimeout(timer)
      fail()
    }
    document.head.append(script)
  })
  return loading
}

let client = null
/** 窓の結果を待っている約束と、その resolve。窓を開いている間だけある */
let pending = null

/** 窓の結果を、待っている約束へ渡す */
function settle(outcome) {
  const resolve = pending?.resolve
  pending = null
  resolve?.(outcome)
}

/** Googleが callback に渡した結果を、{ token } か { error: 文言 } にする */
function fromResponse(response) {
  if (response?.error) return { error: lookup(SIGN_IN_ERRORS, response.error) ?? SIGN_IN_MESSAGES.other }
  if (!response?.access_token) return { error: SIGN_IN_MESSAGES.other }
  // Driveを見る許可が無いトークンでは、読めない。
  if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) return { error: SIGN_IN_ERRORS.scope }
  const expiresIn = Number(response.expires_in) || 3600
  store.set('sessionStorage', TOKEN_KEY, { token: response.access_token, expiresAt: Date.now() + expiresIn * 1000 })
  store.set('localStorage', CHOOSE_ACCOUNT_KEY, null)
  return { token: response.access_token }
}

/** Googleが error_callback に渡した知らせを、{ error: 文言 } にする */
function fromWindowError(error) {
  if (error?.type === 'popup_closed') return { error: SIGN_IN_MESSAGES.closed }
  if (error?.type === 'popup_failed_to_open') return { error: SIGN_IN_MESSAGES.blocked }
  return { error: SIGN_IN_MESSAGES.other }
}

/** 次のログインで、アカウントを選ぶ画面を出すか。見つからない時の案内が出た後と、保存が使えない設定(覚えておけない)の時は出す */
function shouldChooseAccount() {
  if (store.get('localStorage', CHOOSE_ACCOUNT_KEY)) return true
  const probe = 'workbench:probe'
  const writable = store.set('localStorage', probe, true)
  store.set('localStorage', probe, null)
  return !writable
}

/**
 * Googleのログインの窓を開き、{ token } か { error: 文言 } の約束を返す。
 * ボタンを押した処理の中から、待たずに呼ぶ(loadSignIn が済んでいる前提)。
 * 窓を開いている間にもう一度呼ぶと、窓をもう一度開き(窓は1つのまま)、同じ約束を返す。
 */
export function signIn() {
  client ??= window.google.accounts.oauth2.initTokenClient({
    client_id: window.WORKBENCH_CONFIG?.googleClientId,
    scope: DRIVE_SCOPE,
    include_granted_scopes: true,
    callback: response => settle(fromResponse(response)),
    error_callback: error => settle(fromWindowError(error)),
  })
  if (!pending) {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    pending = { promise, resolve }
  }
  const { promise } = pending
  try {
    client.requestAccessToken({ prompt: shouldChooseAccount() ? 'select_account' : '' })
  }
  catch {
    // 窓を開けずに投げた時は、待ち続けないよう、そのほかの失敗として終える。
    settle({ error: SIGN_IN_MESSAGES.other })
  }
  return promise
}

/** Driveのフォルダで見つからない時の案内が出た時に呼ぶ。次のログインで、アカウントを選ぶ画面を出す */
export function rememberWrongAccount() {
  store.set('localStorage', CHOOSE_ACCOUNT_KEY, true)
}

/**
 * Driveを読むためのトークンを用意する。
 * 戻り値は { token } か、{ ask: 文言 }(ボタンを出してログインしてもらう)か、{ error: 文言 }(ログインできない)。
 */
export function driveToken() {
  if (!window.WORKBENCH_CONFIG?.googleClientId) return { error: 'GoogleのクライアントIDが設定されていません(config.js)。' }
  const token = savedToken()
  if (token) return { token }
  return { ask: 'Driveのフォルダを読むために、Googleでログインしてください。' }
}

/** トークンが切れた時に呼ぶ。次に開いた時は、もう一度ログインする */
export function forgetToken() {
  store.set('sessionStorage', TOKEN_KEY, null)
}

// 前の版のファイルがブラウザのキャッシュに残っている間のために、前の版が読み込む名前は書き出し続ける
// (page.js は DriveSource・UrlSource・driveToken・forgetToken・goToSignIn を、auth.js は finishSignIn を読み込む)。

/** 前の版の page.js が、ボタンを押した時に呼ぶ。ページを読み直して、新しい版を読み込ませる */
export function goToSignIn() {
  location.reload()
}

/** 前の版の auth/ から呼ばれる。トークンは読み込んだ時に URL から消してあり、受け取らない。戻す先は無いものとして扱う */
export function finishSignIn() {
  return { lost: true }
}
