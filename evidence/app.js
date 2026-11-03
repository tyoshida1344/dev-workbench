// エビデンスビューア。Driveのフォルダ(またはURL)から manifest.json と動画を読んで、項目の一覧から見て回る。
// manifest.json の形は docs/evidence-manifest.md。
//
// 読み込んだ文字は textContent でだけ出す(HTMLとして解釈しない)。他人が作ったフォルダを
// 開かされても、ログインの情報を抜かれないようにするため。
'use strict'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const MARK = { ok: '○', partial: '△', ng: '×' }
const LABEL = { ok: '期待どおり', partial: '一部だけ確認', ng: '期待どおりでない' }

const $ = id => document.getElementById(id)
const params = new URLSearchParams(location.search)

/** Driveのフォルダから読む。ログインした人がもともと見られるファイルだけが読める。 */
class DriveSource {
  constructor(folderId, token) {
    this.folderId = folderId
    this.token = token
    this.ids = null
  }

  async request(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    if (!response.ok) throw new Error(`Driveから読めませんでした(${response.status})`)
    return response
  }

  async idOf(name) {
    if (!this.ids) {
      const q = encodeURIComponent(`'${this.folderId}' in parents and trashed = false`)
      const url = `${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`
      const { files } = await (await this.request(url)).json()
      this.ids = new Map(files.map(file => [file.name, file.id]))
    }
    const id = this.ids.get(name)
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
    state.blobs.set(name, state.source.file(name).then(r => r.blob()).then(blob => URL.createObjectURL(blob)))
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

async function open(source) {
  state.source = source
  showGate('読み込み中...')
  try {
    const manifest = await (await source.file('manifest.json')).json()
    render(manifest)
    select(state.playlist.findIndex(entry => entry.kind === 'video'))
  }
  catch (error) {
    showGate(error.message)
  }
}

function signInToDrive(folderId) {
  const clientId = window.WORKBENCH_CONFIG?.googleClientId
  if (!clientId) {
    showGate('GoogleのクライアントIDが設定されていません(config.js)。')
    return
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      if (response.error) {
        showGate(`ログインできませんでした(${response.error})。`, { signIn: true })
        return
      }
      open(new DriveSource(folderId, response.access_token))
    },
  })
  // ログインの窓は、押した操作の中でないと開けない。
  showGate('Driveのフォルダを読むために、Googleでログインしてください。', { signIn: true })
  $('sign-in').onclick = () => client.requestAccessToken()
}

function start() {
  $('player').addEventListener('ended', () => {
    if ($('continuous').checked) step(1)
  })
  $('prev').addEventListener('click', () => step(-1))
  $('next').addEventListener('click', () => step(1))

  const folder = params.get('folder')
  const base = params.get('base')

  if (folder) {
    if (!/^[\w-]+$/.test(folder)) {
      showGate('フォルダのIDの形が正しくありません。')
      return
    }
    // GoogleのログインのスクリプトはasyncなのでDOMより後に届くことがある。
    const wait = () => (window.google?.accounts?.oauth2 ? signInToDrive(folder) : setTimeout(wait, 100))
    wait()
    return
  }

  if (base) {
    open(new UrlSource(new URL(base, location.href).href))
    return
  }

  showGate('URLに ?folder=<DriveのフォルダID> を付けて開いてください。')
}

start()
