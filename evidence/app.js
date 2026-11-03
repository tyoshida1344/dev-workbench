// エビデンスビューア。Driveのフォルダ(またはURL)から manifest.json と動画を読んで、項目の一覧から見て回る。
// manifest.json の形は docs/evidence-manifest.md。
//
// 読み込んだ文字は textContent でだけ出す(HTMLとして解釈しない)。他人が作ったフォルダを
// 開かされても、ログインの情報を抜かれないようにするため。
'use strict'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SIGN_IN_KEY = 'evidence-viewer:sign-in'
const MARK = { ok: '○', partial: '△', ng: '×' }
const LABEL = { ok: '期待どおり', partial: '一部だけ確認', ng: '期待どおりでない' }

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
    if (!response.ok) throw new Error(`Driveから読めませんでした(${response.status})`)
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
  /** 一覧に並ぶ順の、動画を持つもの(項目と添付の動画) */
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
    const { ok = 0, partial = 0, ng = 0 } = manifest.summary
    $('summary').textContent = `○ ${ok} / △ ${partial} / × ${ng}`
    $('summary').hidden = false
  }

  $('notes').replaceChildren(...(manifest.notes ?? []).map(note => el('li', { text: note })))

  const sections = $('sections')
  sections.replaceChildren()
  for (const section of manifest.sections ?? []) {
    sections.append(el('h2', { text: section.title, className: 'section-title' }))
    const list = el('ul', { className: 'items' })
    for (const item of section.items ?? []) {
      const index = item.video ? state.playlist.push({ kind: 'video', file: item.video, item }) - 1 : -1
      const button = el('button', {
        className: `item ${item.result ?? ''}`,
        attrs: { type: 'button', 'data-index': String(index), title: LABEL[item.result] ?? '' },
      }, [
        el('span', { text: item.id ?? '', className: 'item-id' }),
        el('span', { text: MARK[item.result] ?? '・', className: 'item-mark' }),
        el('span', { text: item.title, className: 'item-title' }),
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
    const isVideo = /\.(webm|mp4|mov)$/i.test(attachment.file)
    const entry = { kind: isVideo ? 'video' : 'text', file: attachment.file, item: { title: attachment.title } }
    const index = state.playlist.push(entry) - 1
    const button = el('button', { className: 'item', attrs: { type: 'button', 'data-index': String(index) } }, [
      el('span', { text: isVideo ? '▶' : '≡', className: 'item-mark' }),
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
  $('item-title').textContent = [item.id && `#${item.id}`, item.title].filter(Boolean).join(' ')
  $('item-checks').replaceChildren(...(item.checks ?? []).map(check => el('li', { text: check })))
  $('item-note').textContent = item.note ? `※ ${item.note}` : ''
  $('item-note').hidden = !item.note

  const player = $('player')
  const text = $('text')
  try {
    if (entry.kind === 'text') {
      player.pause()
      player.hidden = true
      text.hidden = false
      text.textContent = await (await state.source.file(entry.file)).text()
      return
    }
    text.hidden = true
    player.hidden = false
    player.src = await blobUrl(entry.file)
    await player.play().catch(() => {})
    // 連続再生で間が空かないよう、次の動画を先に読んでおく。
    const next = state.playlist[index + 1]
    if (next?.kind === 'video') blobUrl(next.file).catch(() => {})
  }
  catch (error) {
    text.hidden = false
    player.hidden = true
    text.textContent = error.message
  }
}

function step(delta) {
  let index = state.current + delta
  while (state.playlist[index] && state.playlist[index].kind !== 'video') index += delta
  if (state.playlist[index]) select(index)
}

async function open(source, index = -1) {
  state.source = source
  showGate('読み込み中...')
  try {
    const manifest = await (await source.file('manifest.json')).json()
    render(manifest)
    select(state.playlist[index] ? index : state.playlist.findIndex(entry => entry.kind === 'video'))
  }
  catch (error) {
    showGate(error.message)
  }
}

/** ログインから戻ってくる先。Google Cloudの「承認済みのリダイレクトURI」に同じものを登録する */
function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '')
}

/**
 * Googleのログイン画面へ移る。ポップアップの窓は止められる環境があるので、ページごと移って戻ってくる。
 * 戻ってきた時に続きから見られるよう、フォルダと見ていた項目を覚えておく。
 */
function goToSignIn(clientId, folderId, index = -1) {
  const nonce = crypto.randomUUID()
  sessionStorage.setItem(SIGN_IN_KEY, JSON.stringify({ nonce, folderId, index }))
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    state: nonce,
    include_granted_scopes: 'true',
  })
  location.assign(`${AUTH_URL}?${query}`)
}

/** ログインから戻ってきたなら、URLの # からトークンを取り出す。戻ってきたのでなければ null */
function takeSignInResult() {
  const result = new URLSearchParams(location.hash.slice(1))
  if (!result.has('access_token') && !result.has('error')) return null

  let saved = null
  try {
    saved = JSON.parse(sessionStorage.getItem(SIGN_IN_KEY))
  }
  catch {}
  sessionStorage.removeItem(SIGN_IN_KEY)
  // トークンを履歴やブックマークに残さない。
  const back = saved?.folderId ? `?folder=${encodeURIComponent(saved.folderId)}` : ''
  history.replaceState(null, '', redirectUri() + back)

  // 自分が始めたログインの戻りでなければ使わない(他人のトークンを付けたURLを開かされても読まない)。
  if (!saved || result.get('state') !== saved.nonce) return { error: 'state_mismatch' }
  if (result.has('error')) return { error: result.get('error') }
  return { token: result.get('access_token'), index: saved.index }
}

function signInToDrive(folderId) {
  const clientId = window.WORKBENCH_CONFIG?.googleClientId
  if (!clientId) {
    showGate('GoogleのクライアントIDが設定されていません(config.js)。')
    return
  }
  $('sign-in').onclick = () => goToSignIn(clientId, folderId)

  const returned = takeSignInResult()
  if (!returned) {
    showGate('Driveのフォルダを読むために、Googleでログインしてください。', { signIn: true })
    return
  }
  if (returned.error) {
    showGate(`ログインできませんでした(${returned.error})。`, { signIn: true })
    return
  }

  // 見ている途中でトークンが切れたら、押してもらってログインし直す。ページを移るので、この約束は果たされない。
  const renew = () => new Promise(() => {
    if ($('viewer').hidden) {
      showGate('ログインの期限が切れました。もう一度ログインしてください。', { signIn: true })
      return
    }
    $('reauth').hidden = false
    $('reauth-button').onclick = () => goToSignIn(clientId, folderId, state.current)
  })
  open(new DriveSource(folderId, returned.token, renew), returned.index)
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
  if (!folder && location.hash) {
    try {
      folder = JSON.parse(sessionStorage.getItem(SIGN_IN_KEY))?.folderId
    }
    catch {}
  }
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
