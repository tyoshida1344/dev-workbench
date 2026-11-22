// 道具が共通で使う、Googleでのログインと、Drive・URLからの読み込み。
//
// ログインは、ページごとGoogleへ移って auth/ に戻り、auth/ が元のページへ戻す。
// 戻り先を auth/ の1か所にまとめるので、Google Cloudに登録するリダイレクトURIは1つで済む。
// トークンはタブの中(sessionStorage)に、期限まで置く。道具をまたいで同じトークンを使う。

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

/** ログインから戻ってくる先。Google Cloudの「承認済みのリダイレクトURI」に同じものを登録する */
export const REDIRECT_URI = new URL('../auth/', import.meta.url).href

/** ブラウザの保存先('sessionStorage' か 'localStorage')。使えない設定もあるので、失敗しても止まらないようにする */
export const store = {
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

/** Driveが返したエラーの理由(APIが有効でない、許可が足りない、など)。読めなければ空 */
async function reasonOf(response) {
  try {
    const { error } = await response.json()
    const reason = error.details?.find(detail => detail.reason)?.reason ?? error.errors?.[0]?.reason
    return [reason, error.message].filter(Boolean).map(text => `: ${text}`).join('')
  }
  catch {
    return ''
  }
}

/** Driveのフォルダから読む。ログインした人がもともと見られるファイルだけが読める。パスは / で区切る */
export class DriveSource {
  /** renew は、トークンが切れた時に新しいトークンを返す(ログインし直してもらう) */
  constructor(folderId, token, renew) {
    this.folderId = folderId
    this.token = token
    this.renew = renew
    this.renewing = null
    /** フォルダのID → その中身(名前 → { id, name, folder })の約束 */
    this.folders = new Map()
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
    if (!response.ok) throw new Error(`Driveから読めませんでした(${response.status}${await reasonOf(response)})`)
    return response
  }

  async children(folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const entries = new Map()
    let pageToken = ''
    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`
        + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      const page = await (await this.request(url)).json()
      for (const file of page.files) entries.set(file.name, { id: file.id, name: file.name, folder: file.mimeType === FOLDER })
      pageToken = page.nextPageToken
    } while (pageToken)
    return entries
  }

  entriesOf(folderId) {
    if (!this.folders.has(folderId)) {
      // 読めなかった時は覚えておかず、次に読み直す。
      const entries = this.children(folderId)
      entries.catch(() => this.folders.delete(folderId))
      this.folders.set(folderId, entries)
    }
    return this.folders.get(folderId)
  }

  /** パス(a/b/c.md)のもの。無ければ null */
  async find(path) {
    let entry = { id: this.folderId, folder: true }
    for (const name of path.split('/').filter(Boolean)) {
      if (!entry.folder) return null
      entry = (await this.entriesOf(entry.id)).get(name)
      if (!entry) return null
    }
    return entry
  }

  /** フォルダの中身。名前の順に { name, id, folder } を返す。無ければ空 */
  async list(path = '') {
    const entry = await this.find(path)
    if (!entry?.folder) return []
    return [...(await this.entriesOf(entry.id)).values()]
  }

  async file(path) {
    const entry = await this.find(path)
    if (!entry || entry.folder) throw new Error(`フォルダに ${path} がありません`)
    return this.request(`${DRIVE_API}/files/${entry.id}?alt=media&supportsAllDrives=true`)
  }
}

/** URLから読む。見本(<サイト>/sample/<道具>/)を読む。フォルダの中身は一覧できない */
export class UrlSource {
  constructor(base) {
    this.base = base.endsWith('/') ? base : `${base}/`
  }

  async file(path) {
    // 読むのは base のフォルダの中だけ。.. や空の部分で外へ出るパスは読まない(Drive から読む時と同じ範囲にする)
    const parts = path.split('/')
    if (parts.some(part => part === '' || part === '.' || part === '..')) throw new Error(`フォルダの外は読めません: ${path}`)
    const response = await fetch(new URL(parts.map(encodeURIComponent).join('/'), this.base))
    if (!response.ok) throw new Error(`${path} を読めませんでした(${response.status})`)
    return response
  }
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
 */
export function finishSignIn() {
  const result = new URLSearchParams(location.hash.slice(1))
  const saved = store.get('sessionStorage', SIGN_IN_KEY)
  store.set('sessionStorage', SIGN_IN_KEY, null)
  // トークンを履歴に残さない。
  history.replaceState(null, '', location.pathname)

  const back = saved?.back && new URL(saved.back, location.href)
  if (!saved || !back || back.origin !== location.origin || result.get('state') !== saved.nonce) {
    return { error: 'このログインはこのページから始めたものではありません。道具のページを開き直してください。' }
  }

  let outcome
  if (result.has('error')) outcome = { error: result.get('error'), silent: saved.silent }
  // 同意の画面でDriveを見る許可のチェックを外すと、トークンはもらえても読めない。
  else if (!result.get('scope')?.split(' ').includes(DRIVE_SCOPE)) outcome = { error: 'Driveのファイルを見る許可にチェックを付けてください' }
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
 * 戻り値は { token } か、{ ask: 文言 }(ボタンを出してログインしてもらう)か、{ wait: true }(ログインへ移っている)。
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
    return { ask: `ログインできませんでした(${outcome.error})。` }
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

/** DriveのフォルダのIDとして使える形か */
export function isFolderId(id) {
  return /^[\w-]+$/.test(id)
}
