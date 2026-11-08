// エビデンスビューア。Driveのフォルダ(またはURL)から manifest.json と動画・画像・テキストを読んで、項目の一覧から見て回る。
// manifest.json の形は docs/evidence-manifest.md。
//
// 読み込んだ文字は textContent でだけ出す(HTMLとして解釈しない)。他人が作ったフォルダを
// 開かされても、ログインの情報を抜かれないようにするため。
'use strict'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SIGN_IN_KEY = 'evidence-viewer:sign-in'
/** 受け取ったトークン。タブの中(sessionStorage)にだけ、期限まで置く */
const TOKEN_KEY = 'evidence-viewer:token'
/** 一度ログインできたしるし(localStorage)。あれば、開いた時に画面を出さずにログインを試す */
const SIGNED_IN_KEY = 'evidence-viewer:signed-in'
// 結果の印。ほとんどが期待どおりなので、期待どおりは控えめにし、そうでないものを目立たせる(style.css)。
const MARK = { ok: '✓', partial: '!', ng: '✕' }
const LABEL = { ok: '期待どおり', partial: '一部だけ確認', ng: '期待どおりでない' }
/** 確認の行(checks)の頭に書かれた結果の記号 */
const CHECK_RESULT = { '○': 'ok', '✓': 'ok', '△': 'partial', '!': 'partial', '×': 'ng', '✕': 'ng' }
/** 画面で見るもの。次へ/前への送りはこれで止まり、テキストは飛ばす */
const MEDIA = new Set(['video', 'image'])
/** 添付の一覧に出す、何として開くかの印 */
const KIND_MARK = { video: '▶', image: '▣', text: '≡' }

const $ = id => document.getElementById(id)

/** Driveのフォルダから読む。ログインした人がもともと見られるファイルだけが読める。 */
class DriveSource {
  /** renew は、トークンが切れた時に新しいトークンを返す(ログインし直してもらう) */
  constructor(folderId, token, renew) {
    this.folderId = folderId
    this.token = token
    this.renew = renew
    this.renewing = null
    this.ids = null
  }

  async request(url) {
    const send = () => fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    let response = await send()
    if (response.status === 401) {
      // アクセストークンは1時間で切れる。同時に切れたことに気づいた読み込みは、同じログインを待つ。
      this.renewing ??= this.renew().then(token => { this.token = token }).finally(() => { this.renewing = null })
      await this.renewing
      response = await send()
    }
    if (!response.ok) throw new Error(`Driveから読めませんでした(${response.status}${await reasonOf(response)})`)
    return response
  }

  async list() {
    const q = encodeURIComponent(`'${this.folderId}' in parents and trashed = false`)
    const ids = new Map()
    let pageToken = ''
    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`
        + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      const page = await (await this.request(url)).json()
      for (const file of page.files) ids.set(file.name, file.id)
      pageToken = page.nextPageToken
    } while (pageToken)
    return ids
  }

  async idOf(name) {
    this.ids ??= this.list().catch((error) => {
      this.ids = null
      throw error
    })
    const id = (await this.ids).get(name)
    if (!id) throw new Error(`フォルダに ${name} がありません`)
    return id
  }

  async file(name) {
    return this.request(`${DRIVE_API}/files/${await this.idOf(name)}?alt=media&supportsAllDrives=true`)
  }
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

/** URLから読む。手元で確かめる時に、ファイルを置いたフォルダを簡易サーバーで配って使う。 */
class UrlSource {
  constructor(base) {
    this.base = base.endsWith('/') ? base : `${base}/`
  }

  async file(name) {
    const response = await fetch(new URL(encodeURIComponent(name), this.base))
    if (!response.ok) throw new Error(`${name} を読めませんでした(${response.status})`)
    return response
  }
}

const state = {
  source: null,
  /** 一覧に並ぶ順の、開けるもの(動画か画像を持つ項目と、添付のすべて) */
  playlist: [],
  current: -1,
  blobs: new Map(),
}

function el(tag, { text, className, attrs } = {}, children = []) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value)
  node.append(...children)
  return node
}

/** 結果の印。色だけでなく記号の形でも見分けられるようにし、読み上げには言葉を渡す */
function mark(result) {
  if (!MARK[result]) return el('span', { text: '・', className: 'mark' })
  return el('span', { text: MARK[result], className: `mark ${result}`, attrs: { role: 'img', 'aria-label': LABEL[result], title: LABEL[result] } })
}

/** `…` で囲んだところを、画面の文言やコードとして等幅で出す(textContent で入れるので、HTMLとしては解釈しない) */
function inline(text) {
  return String(text).split('`').map((part, i) => (i % 2 ? el('code', { text: part }) : part)).filter(part => part !== '')
}

/** 確認の行。頭の ○ / △ / × は、一覧と同じ印にして本文から外す */
function check(text) {
  const head = /^([○✓△!×✕])\s*/.exec(text)
  const result = head && CHECK_RESULT[head[1]]
  return el('li', {}, [mark(result), el('span', {}, inline(result ? text.slice(head[0].length) : text))])
}

/** ファイル名の拡張子から、何として開くかを決める */
function kindOf(file) {
  if (/\.(webm|mp4|mov)$/i.test(file)) return 'video'
  if (/\.(png|jpe?g|webp)$/i.test(file)) return 'image'
  return 'text'
}

function showGate(message, { signIn = false } = {}) {
  $('gate').hidden = false
  $('viewer').hidden = true
  $('gate-message').textContent = message
  $('sign-in').hidden = !signIn
}

async function blobUrl(name) {
  if (!state.blobs.has(name)) {
    const url = state.source.file(name).then(r => r.blob()).then(blob => URL.createObjectURL(blob))
    // 読めなかった時は覚えておかず、もう一度押せば読み直す。
    url.catch(() => state.blobs.delete(name))
    state.blobs.set(name, url)
  }
  return state.blobs.get(name)
}

function render(manifest) {
  document.title = `${manifest.title} — エビデンスビューア`
  $('title').textContent = manifest.title

  if (manifest.source?.url) {
    const source = $('source')
    source.href = manifest.source.url
    source.textContent = [manifest.source.repository, manifest.source.commit && `commit ${manifest.source.commit}`, manifest.recordedAt]
      .filter(Boolean).join(' / ')
    source.hidden = false
  }

  if (manifest.summary) {
    $('summary').replaceChildren(...Object.keys(MARK).map(result =>
      el('span', { className: 'count' }, [mark(result), String(manifest.summary[result] ?? 0)])))
    $('summary').hidden = false
  }

  $('notes').replaceChildren(...(manifest.notes ?? []).map(note => el('li', { text: note })))

  const sections = $('sections')
  sections.replaceChildren()
  for (const section of manifest.sections ?? []) {
    sections.append(el('h2', { text: section.title, className: 'section-title' }))
    const list = el('ul', { className: 'items' })
    for (const item of section.items ?? []) {
      // 1つの項目が持つのは動画か画像のどちらか(両方あれば動画を見せる)。どちらも無ければ押せない。
      const file = item.video ?? item.image
      const index = file ? state.playlist.push({ kind: item.video ? 'video' : 'image', file, item }) - 1 : -1
      const button = el('button', {
        className: `item ${item.result ?? ''}`,
        attrs: { type: 'button', 'data-index': String(index), title: LABEL[item.result] ?? '' },
      }, [
        el('span', { text: item.id ?? '', className: 'item-id' }),
        mark(item.result),
        el('span', { className: 'item-title' }, inline(item.title)),
      ])
      if (index === -1) button.disabled = true
      button.addEventListener('click', () => select(index))
      list.append(el('li', {}, [button]))
    }
    sections.append(list)
  }

  const attachments = $('attachments')
  attachments.replaceChildren()
  for (const attachment of manifest.attachments ?? []) {
    const kind = kindOf(attachment.file)
    const entry = { kind, file: attachment.file, item: { title: attachment.title } }
    const index = state.playlist.push(entry) - 1
    const button = el('button', { className: 'item', attrs: { type: 'button', 'data-index': String(index) } }, [
      el('span', { className: 'item-id' }),
      el('span', { text: KIND_MARK[kind], className: 'mark' }),
      el('span', { text: attachment.title, className: 'item-title' }),
    ])
    button.addEventListener('click', () => select(index))
    attachments.append(el('li', {}, [button]))
  }

  $('gate').hidden = true
  $('viewer').hidden = false
}

async function select(index) {
  const entry = state.playlist[index]
  if (!entry) return
  state.current = index

  for (const button of document.querySelectorAll('.item[data-index]')) {
    button.classList.toggle('current', button.dataset.index === String(index))
  }
  document.querySelector(`.item[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })

  const { item } = entry
  const heading = [item.id && `#${item.id}`, item.title].filter(Boolean).join(' ')
  $('item-title').replaceChildren(...(item.result ? [mark(item.result)] : []), el('span', {}, inline(heading)))
  $('item-title').classList.toggle('with-mark', Boolean(item.result))
  $('item-checks').replaceChildren(...(item.checks ?? []).map(check))
  $('checks-title').hidden = !item.checks?.length
  $('item-note').textContent = item.note ? `※ ${item.note}` : ''
  $('item-note').hidden = !item.note

  const player = $('player')
  const image = $('image')
  const text = $('text')
  // 動画・画像・テキストは同じ場所に出す。ひとつだけ出し、動画は映っていない間は止めておく。
  const show = (shown) => {
    if (shown !== player) player.pause()
    for (const node of [player, image, text]) node.hidden = node !== shown
  }
  try {
    if (entry.kind === 'text') {
      show(text)
      text.textContent = await (await state.source.file(entry.file)).text()
      return
    }
    const url = await blobUrl(entry.file)
    if (entry.kind === 'image') {
      image.alt = item.title ?? ''
      image.src = url
      show(image)
    }
    else {
      show(player)
      player.src = url
      await player.play().catch(() => {})
    }
    // 連続再生で間が空かないよう、次に見るものを先に読んでおく。
    const next = state.playlist[index + 1]
    if (next && MEDIA.has(next.kind)) blobUrl(next.file).catch(() => {})
  }
  catch (error) {
    show(text)
    text.textContent = error.message
  }
}

function step(delta) {
  let index = state.current + delta
  while (state.playlist[index] && !MEDIA.has(state.playlist[index].kind)) index += delta
  if (state.playlist[index]) select(index)
}

async function open(source, index = -1) {
  state.source = source
  showGate('読み込み中...')
  try {
    const manifest = await (await source.file('manifest.json')).json()
    render(manifest)
    select(state.playlist[index] ? index : state.playlist.findIndex(entry => MEDIA.has(entry.kind)))
  }
  catch (error) {
    showGate(error.message)
  }
}

/** ログインから戻ってくる先。Google Cloudの「承認済みのリダイレクトURI」に同じものを登録する */
function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '')
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

/** 期限まで1分以上あるトークン。無ければ null */
function savedToken() {
  const saved = store.get('sessionStorage', TOKEN_KEY)
  return saved?.token && saved.expiresAt - Date.now() > 60_000 ? saved.token : null
}

/**
 * Googleのログイン画面へ移る。ポップアップの窓は止められる環境があるので、ページごと移って戻ってくる。
 * 戻ってきた時に続きから見られるよう、フォルダと見ていた項目を覚えておく。
 * silent なら画面を出さずに試し、Googleのログインや同意が要る時はエラーで戻ってくる。
 */
function goToSignIn(clientId, folderId, { index = -1, silent = false } = {}) {
  const nonce = crypto.randomUUID()
  store.set('sessionStorage', SIGN_IN_KEY, { nonce, folderId, index, silent })
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    state: nonce,
    include_granted_scopes: 'true',
  })
  if (silent) query.set('prompt', 'none')
  location.assign(`${AUTH_URL}?${query}`)
}

/** ログインから戻ってきたなら、URLの # からトークンを取り出す。戻ってきたのでなければ null */
function takeSignInResult() {
  const result = new URLSearchParams(location.hash.slice(1))
  if (!result.has('access_token') && !result.has('error')) return null

  const saved = store.get('sessionStorage', SIGN_IN_KEY)
  store.set('sessionStorage', SIGN_IN_KEY, null)
  // トークンを履歴やブックマークに残さない。
  const back = saved?.folderId ? `?folder=${encodeURIComponent(saved.folderId)}` : ''
  history.replaceState(null, '', redirectUri() + back)

  // 自分が始めたログインの戻りでなければ使わない(他人のトークンを付けたURLを開かされても読まない)。
  if (!saved || result.get('state') !== saved.nonce) return { error: 'state_mismatch' }
  if (result.has('error')) return { error: result.get('error'), silent: saved.silent }
  // 同意の画面でDriveを見る許可のチェックを外すと、トークンはもらえても読めない。
  if (!result.get('scope')?.split(' ').includes(DRIVE_SCOPE)) return { error: 'Driveのファイルを見る許可にチェックを付けてください' }

  const expiresIn = Number(result.get('expires_in')) || 3600
  store.set('sessionStorage', TOKEN_KEY, { token: result.get('access_token'), expiresAt: Date.now() + expiresIn * 1000 })
  store.set('localStorage', SIGNED_IN_KEY, true)
  return { token: result.get('access_token'), index: saved.index }
}

function signInToDrive(folderId) {
  const clientId = window.WORKBENCH_CONFIG?.googleClientId
  if (!clientId) {
    showGate('GoogleのクライアントIDが設定されていません(config.js)。')
    return
  }
  $('sign-in').onclick = () => goToSignIn(clientId, folderId)
  const askToSignIn = () => showGate('Driveのフォルダを読むために、Googleでログインしてください。', { signIn: true })

  const returned = takeSignInResult()
  if (returned?.error) {
    if (returned.silent) {
      // 画面を出さずにはログインできなかった(Googleからログアウトしている、など)。次からは試さずにボタンを出す。
      store.set('localStorage', SIGNED_IN_KEY, null)
      askToSignIn()
      return
    }
    showGate(`ログインできませんでした(${returned.error})。`, { signIn: true })
    return
  }

  const token = returned?.token ?? savedToken()
  if (!token) {
    if (store.get('localStorage', SIGNED_IN_KEY)) {
      showGate('ログイン中...')
      goToSignIn(clientId, folderId, { silent: true })
      return
    }
    askToSignIn()
    return
  }

  // 見ている途中でトークンが切れたら、押してもらってログインし直す。ページを移るので、この約束は果たされない。
  const renew = () => new Promise(() => {
    store.set('sessionStorage', TOKEN_KEY, null)
    if ($('viewer').hidden) {
      showGate('ログインの期限が切れました。もう一度ログインしてください。', { signIn: true })
      return
    }
    $('reauth').hidden = false
    $('reauth-button').onclick = () => goToSignIn(clientId, folderId, { index: state.current })
  })
  open(new DriveSource(folderId, token, renew), returned?.index)
}

function start() {
  $('player').addEventListener('ended', () => {
    if ($('continuous').checked) step(1)
  })
  $('prev').addEventListener('click', () => step(-1))
  $('next').addEventListener('click', () => step(1))

  // ログインから戻った時はURLに ?folder= が無いので、覚えておいたフォルダを使う。
  const params = new URLSearchParams(location.search)
  let folder = params.get('folder')
  if (!folder && location.hash) folder = store.get('sessionStorage', SIGN_IN_KEY)?.folderId
  const base = params.get('base')

  if (folder) {
    if (!/^[\w-]+$/.test(folder)) {
      showGate('フォルダのIDの形が正しくありません。')
      return
    }
    signInToDrive(folder)
    return
  }

  if (base) {
    open(new UrlSource(new URL(base, location.href).href))
    return
  }

  showGate('URLに ?folder=<DriveのフォルダID> を付けて開いてください。')
}

start()
