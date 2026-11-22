// 道具が共通で使う、Googleでのログインと、Drive・URLからの読み込み。
//
// ログインは、ページごとGoogleへ移って auth/ に戻り、auth/ が元のページへ戻す。
// 戻り先を auth/ の1か所にまとめるので、Google Cloudに登録するリダイレクトURIは1つで済む。
// トークンはタブの中(sessionStorage)に、期限まで置く。道具をまたいで同じトークンを使う。

import { lookup } from './path.js'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const FOLDER = 'application/vnd.google-apps.folder'
/** ログインを始めた時の約束(戻ってきた時に、自分が始めたログインかを確かめる) */
const SIGN_IN_KEY = 'workbench:sign-in'
/** auth/ が置いていく、ログインの結果(トークンかエラー) */
const RESULT_KEY = 'workbench:sign-in-result'
/** 受け取ったトークン。タブの中(sessionStorage)にだけ、期限まで置く */
const TOKEN_KEY = 'workbench:token'
/** 一度ログインできたしるし(localStorage)。あれば、開いた時に画面を出さずにログインを試す */
const SIGNED_IN_KEY = 'workbench:signed-in'
/** 前の版(エビデンスビューアだけだった時)の、ログインできたしるし */
const OLD_SIGNED_IN_KEY = 'evidence-viewer:signed-in'

/** ログインから戻ってくる先。Google Cloudの「承認済みのリダイレクトURI」に同じものを登録する */
const REDIRECT_URI = new URL('../auth/', import.meta.url).href

/** ログインの結果のコードを、画面に出す言葉にする */
const SIGN_IN_ERRORS = {
  access_denied: 'ログインをやめました。読むにはもう一度ログインしてください。',
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
  set(storage, key, value) {
    try {
      if (value === null) window[storage].removeItem(key)
      else window[storage].setItem(key, JSON.stringify(value))
    }
    catch {}
  },
}

// 前の版から移る人のために。
// 前の版のログインできたしるしを、新しいしるしへ移して消す。
if (store.get('localStorage', OLD_SIGNED_IN_KEY)) {
  store.set('localStorage', SIGNED_IN_KEY, true)
  store.set('localStorage', OLD_SIGNED_IN_KEY, null)
}
// 前の版のビューアからログインすると、トークンを # に付けて /evidence/ へ直に戻ってくる。
// 使わずに、アドレスバーと履歴から消す(auth/ は自分で読んでから消すので、ここでは触らない)。
if (location.pathname !== new URL(REDIRECT_URI).pathname && new URLSearchParams(location.hash.slice(1)).has('access_token')) {
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
    let response = await send()
    if (response.status === 401) {
      // アクセストークンは1時間で切れる。同時に切れたことに気づいた読み込みは、同じログインを待つ。
      this.renewing ??= this.renew().then((token) => { this.token = token }).finally(() => { this.renewing = null })
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

/**
 * Googleのログイン画面へ移る。ポップアップの窓は止められる環境があるので、ページごと移って戻ってくる。
 * back は、ログインのあとに戻るこのページのURL(続きから見られるよう、見ていたものを入れておく)。
 * silent なら画面を出さずに試し、Googleのログインや同意が要る時はエラーで戻ってくる。
 */
export function goToSignIn(back = location.href, { silent = false } = {}) {
  const clientId = window.WORKBENCH_CONFIG?.googleClientId
  const nonce = crypto.randomUUID()
  store.set('sessionStorage', SIGN_IN_KEY, { nonce, back, silent })
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: DRIVE_SCOPE,
    state: nonce,
    include_granted_scopes: 'true',
  })
  if (silent) query.set('prompt', 'none')
  location.assign(`${AUTH_URL}?${query}`)
}

/**
 * auth/ で呼ぶ。URLの # からログインの結果を取り出して置き、元のページへ戻す。
 * 自分が始めたログインの戻りでなければ使わない(他人のトークンを付けたURLを開かされても読まない)。
 * 戻す先が分からない時は { lost: true } を返す。
 */
export function finishSignIn() {
  const result = new URLSearchParams(location.hash.slice(1))
  const saved = store.get('sessionStorage', SIGN_IN_KEY)
  store.set('sessionStorage', SIGN_IN_KEY, null)
  // トークンを履歴に残さない。
  history.replaceState(null, '', location.pathname)

  const back = saved?.back && new URL(saved.back, location.href)
  if (!saved || !back || back.origin !== location.origin || result.get('state') !== saved.nonce) return { lost: true }

  let outcome
  if (result.has('error')) outcome = { error: result.get('error'), silent: saved.silent }
  // 同意の画面でDriveを見る許可のチェックを外すと、トークンはもらえても読めない。
  else if (!result.get('scope')?.split(' ').includes(DRIVE_SCOPE)) outcome = { error: 'scope' }
  else {
    const expiresIn = Number(result.get('expires_in')) || 3600
    store.set('sessionStorage', TOKEN_KEY, { token: result.get('access_token'), expiresAt: Date.now() + expiresIn * 1000 })
    store.set('localStorage', SIGNED_IN_KEY, true)
    outcome = { ok: true }
  }
  store.set('sessionStorage', RESULT_KEY, outcome)
  location.replace(back.href)
  return outcome
}

/**
 * Driveを読むためのトークンを用意する。
 * 戻り値は { token } か、{ ask: 文言 }(ボタンを出してログインしてもらう)か、{ wait: true }(ログインへ移っている)か、{ error: 文言 }。
 */
export function driveToken() {
  if (!window.WORKBENCH_CONFIG?.googleClientId) return { error: 'GoogleのクライアントIDが設定されていません(config.js)。' }

  const outcome = store.get('sessionStorage', RESULT_KEY)
  store.set('sessionStorage', RESULT_KEY, null)
  if (outcome?.error) {
    if (outcome.silent) {
      // 画面を出さずにはログインできなかった(Googleからログアウトしている、など)。次からは試さずにボタンを出す。
      store.set('localStorage', SIGNED_IN_KEY, null)
      return { ask: 'Driveのフォルダを読むために、Googleでログインしてください。' }
    }
    return { ask: lookup(SIGN_IN_ERRORS, outcome.error) ?? 'ログインできませんでした。もう一度ログインしてください。' }
  }

  const token = savedToken()
  if (token) return { token }
  if (store.get('localStorage', SIGNED_IN_KEY)) {
    goToSignIn(location.href, { silent: true })
    return { wait: true }
  }
  return { ask: 'Driveのフォルダを読むために、Googleでログインしてください。' }
}

/** トークンが切れた時に呼ぶ。次に開いた時は、もう一度ログインする */
export function forgetToken() {
  store.set('sessionStorage', TOKEN_KEY, null)
}
