// 設計ビューア。Driveの作業フォルダ(またはURL)の Markdown を、文書の一覧から読む。中身は持たない。
// 決まりは docs/design-folder.md。作業フォルダの置き場は docs/workspace.md。
//
// 読み込んだ文字は textContent でだけ出す(md.js)。他人が作ったフォルダを開かされても、ログインの情報を抜かれないようにするため。

import { el } from '../lib/dom.js'
import { renderMarkdown } from '../lib/md.js'
import { showGate, showViewer, sourceFromLocation } from '../lib/page.js'

/** 作業フォルダの直下の決まったファイル。設計を進める順に、呼び名で出す */
const FILE_LABELS = {
  'index.md': '概要',
  'QA.md': '未決',
  'spec.md': '最終仕様',
  'acceptance.md': '受け入れ基準',
  'impl.md': '実装の方針・計画',
  'test.md': 'テストの方針・計画',
}
/** 下書きのフォルダ。この順に、呼び名で出す */
const GROUP_LABELS = { search: '調査', spec: '変更仕様', impl: '実装の下書き', test: 'テストの下書き' }
/** 一覧に出さないフォルダ */
const SKIP = new Set(['images', 'cases', 'evidence'])
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i
/** URLから読む時に、リンクをたどって探す文書の数の上限 */
const CRAWL_LIMIT = 200

const $ = id => document.getElementById(id)

const state = {
  source: null,
  /** パス → { path, label, group } */
  files: new Map(),
  /** パス → 本文の約束 */
  texts: new Map(),
  images: new Map(),
  current: '',
}

const dirOf = path => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '')
const groupOf = path => (path.includes('/') ? path.split('/')[0] : '')

/** 文書から見た相対パスを、作業フォルダからのパスにする。外に出るものは null */
function resolve(from, href) {
  const out = []
  for (const part of (dirOf(from) + href.split(/[?#]/)[0]).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
    }
    else out.push(decodeURIComponent(part))
  }
  return out.join('/')
}

function text(path) {
  if (!state.texts.has(path)) {
    const body = state.source.file(path).then(response => response.text())
    body.catch(() => state.texts.delete(path))
    state.texts.set(path, body)
  }
  return state.texts.get(path)
}

function imageUrl(path) {
  if (!state.images.has(path)) {
    const url = state.source.file(path).then(response => response.blob()).then((blob) => {
      // Driveは .svg を image/svg+xml で返さないことがある。画像として出せるよう、種類を付け直す。
      const typed = /\.svg$/i.test(path) ? new Blob([blob], { type: 'image/svg+xml' }) : blob
      return URL.createObjectURL(typed)
    })
    url.catch(() => state.images.delete(path))
    state.images.set(path, url)
  }
  return state.images.get(path)
}

/** 最初の # 見出し(記号を外したもの)。無ければ null */
function headingOf(body) {
  const m = /^#{1,6}\s+(.+)$/m.exec(body)
  return m ? m[1].replace(/[`*_[\]]/g, '').replace(/\(([^)]*)\)/g, '').trim() : null
}

const fileName = path => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')

/** 呼び名。決まったファイルは決まった呼び名、それ以外は最初の見出し(読めなければファイル名) */
async function labelOf(path) {
  if (FILE_LABELS[path]) return FILE_LABELS[path]
  try {
    return headingOf(await text(path)) ?? fileName(path)
  }
  catch {
    return fileName(path)
  }
}

function rank(order, key) {
  const index = order.indexOf(key)
  return index === -1 ? order.length : index
}

/** 一覧に並べる順。直下の決まったファイル → 直下のほか → 決まった下書きのフォルダ → ほかのフォルダ。同じ所はパスの順 */
function compare(a, b) {
  const groupOrder = Object.keys(GROUP_LABELS)
  const ga = groupOf(a.path)
  const gb = groupOf(b.path)
  if (ga !== gb) {
    if (!ga || !gb) return ga ? 1 : -1
    return rank(groupOrder, ga) - rank(groupOrder, gb) || ga.localeCompare(gb)
  }
  const fileOrder = Object.keys(FILE_LABELS)
  return (ga ? 0 : rank(fileOrder, a.path) - rank(fileOrder, b.path)) || a.path.localeCompare(b.path)
}

/** Driveのフォルダから文書を集める。evidence/ の下のフォルダは、エビデンスビューアへのリンクにする */
async function collectFromDrive() {
  const root = await state.source.list('')
  const paths = root.filter(entry => !entry.folder && /\.md$/i.test(entry.name)).map(entry => entry.name)
  const folders = root.filter(entry => entry.folder && !SKIP.has(entry.name))
  const nested = await Promise.all(folders.map(async folder => (await state.source.list(folder.name))
    .filter(entry => !entry.folder && /\.md$/i.test(entry.name))
    .map(entry => `${folder.name}/${entry.name}`)))
  const evidence = root.some(entry => entry.folder && entry.name === 'evidence')
    ? (await state.source.list('evidence')).filter(entry => entry.folder)
        .map(folder => ({ name: folder.name, href: `../evidence/?folder=${encodeURIComponent(folder.id)}` }))
    : []
  return { paths: [...paths, ...nested.flat()], evidence }
}

/**
 * URLから読む時の、evidence/ の下のフォルダの代わり。作業フォルダの evidence.json に [{ name, base }] で書く(base は作業フォルダからの相対)。
 * 同じサイトの中のものだけを、エビデンスビューアへのリンクにする。
 */
async function evidenceFromUrl() {
  let listed
  try {
    listed = await (await state.source.file('evidence.json')).json()
  }
  catch {
    return []
  }
  if (!Array.isArray(listed)) return []
  return listed.flatMap((entry) => {
    if (typeof entry?.name !== 'string' || typeof entry?.base !== 'string') return []
    const url = new URL(entry.base, state.source.base)
    if (url.origin !== location.origin) return []
    return [{ name: entry.name, href: `../evidence/?base=${encodeURIComponent(url.pathname)}` }]
  })
}

/** URLから読む時は、フォルダの中身を一覧できない。決まったファイルから、相対リンクをたどって文書を集める */
async function collectFromUrl() {
  const found = []
  const queue = Object.keys(FILE_LABELS)
  const seen = new Set(queue)
  while (queue.length && found.length < CRAWL_LIMIT) {
    const path = queue.shift()
    let body
    try {
      body = await text(path)
    }
    catch {
      continue
    }
    found.push(path)
    for (const m of body.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|#|\/)/i.test(m[1])) continue
      const target = resolve(path, m[1])
      if (target && /\.md$/i.test(target) && !SKIP.has(groupOf(target)) && !seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }
  return { paths: found, evidence: await evidenceFromUrl() }
}

function renderList(evidence) {
  const nav = $('files')
  nav.replaceChildren()
  let group = null
  let list = null
  for (const file of [...state.files.values()].sort(compare)) {
    const g = groupOf(file.path)
    if (!list || g !== group) {
      group = g
      if (g) nav.append(el('h2', { text: GROUP_LABELS[g] ?? `${g}/`, className: 'section-title', attrs: { title: `${g}/` } }))
      list = el('ul', { className: 'items' })
      nav.append(list)
    }
    const link = el('a', {
      text: file.label,
      className: 'item plain',
      attrs: { 'href': `#file=${encodeURIComponent(file.path)}`, 'data-path': file.path, 'title': file.path },
    })
    list.append(el('li', {}, [link]))
  }

  if (evidence.length) {
    nav.append(el('h2', { text: 'テスト・エビデンス', className: 'section-title' }))
    nav.append(el('ul', { className: 'items' }, evidence.map(folder => el('li', {}, [
      el('a', {
        text: folder.name,
        className: 'item plain',
        attrs: { href: folder.href, title: 'エビデンスビューアで開く' },
      }),
    ]))))
  }
}

async function open(path) {
  state.current = path
  for (const link of document.querySelectorAll('#files [data-path]')) {
    const current = link.dataset.path === path
    link.classList.toggle('current', current)
    if (current) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  document.querySelector(`#files [data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' })

  const doc = $('doc')
  const label = state.files.get(path)?.label ?? fileName(path)
  $('subtitle').textContent = label
  $('subtitle').hidden = false
  document.title = `${label} — 設計ビューア`
  try {
    const body = await text(path)
    if (state.current !== path) return
    doc.replaceChildren(renderMarkdown(body, {
      link(href) {
        if (/^https?:\/\//i.test(href)) return href
        if (/^(?:[a-z]+:|\/)/i.test(href)) return null
        if (href.startsWith('#')) return null
        const target = resolve(path, href)
        // ほかの文書はこのビューアで開く。それ以外(Driveの中のファイル)はURLで開けないので、リンクにしない。
        return target && /\.md$/i.test(target) ? `#file=${encodeURIComponent(target)}` : null
      },
      image(src) {
        if (/^https?:\/\//i.test(src)) return src
        const target = resolve(path, src)
        return target && IMAGE.test(target) ? imageUrl(target) : null
      },
    }))
  }
  catch (error) {
    if (state.current !== path) return
    doc.replaceChildren(el('p', { text: error.message, className: 'muted' }))
  }
  $('doc').closest('.stage').scrollTop = 0
}

function fromHash() {
  return new URLSearchParams(location.hash.slice(1)).get('file') ?? ''
}

async function start() {
  const source = sourceFromLocation()
  if (!source) return
  state.source = source
  showGate('読み込み中...')

  let collected
  try {
    collected = await (source.list ? collectFromDrive() : collectFromUrl())
  }
  catch (error) {
    showGate(error.message)
    return
  }
  if (!collected.paths.length && !collected.evidence.length) {
    showGate('設計の Markdown がありません(index.md や spec.md などを置くと、ここに出ます)。')
    return
  }

  const labels = await Promise.all(collected.paths.map(labelOf))
  collected.paths.forEach((path, i) => state.files.set(path, { path, label: labels[i] }))

  // 見出しは、概要(index.md)の最初の見出し
  if (state.files.has('index.md')) {
    const heading = headingOf(await text('index.md').catch(() => ''))
    if (heading) $('title').textContent = heading
  }

  renderList(collected.evidence)
  showViewer()
  addEventListener('hashchange', () => {
    const path = fromHash()
    if (path && path !== state.current) open(path)
  })
  const wanted = fromHash()
  const first = [...state.files.values()].sort(compare)[0]?.path
  const path = (wanted && (state.files.has(wanted) || /\.md$/i.test(wanted)) && wanted) || first
  if (path) open(path)
  else $('doc').replaceChildren(el('p', { text: '左の一覧から、テスト・エビデンスを開いてください。', className: 'muted' }))
}

start()
