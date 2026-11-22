// 設計ビューア。Driveの作業フォルダ(またはURL)の Markdown を、文書の一覧から読む。中身は持たない。
// 決まりは docs/design-folder.md。作業フォルダの置き場は docs/workspace.md。
//
// 読み込んだ文字は textContent でだけ出す(md.js)。他人が作ったフォルダを開かされても、ログインの情報を抜かれないようにするため。

import { $, el, setCurrent } from '../_lib/dom.js'
import { renderMarkdown } from '../_lib/md.js'
import { announce, showViewer, startViewer } from '../_lib/page.js'
import { isWebUrl, lookup, resolvePath } from '../_lib/path.js'

/** 作業フォルダの直下の決まったファイル。設計を進める順に、呼び名で出す */
const FILE_LABELS = {
  'index.md': '概要',
  'QA.md': '未決',
  'spec.md': '最終仕様',
  'acceptance.md': '受け入れ基準',
  'impl.md': '実装の方針・計画',
  'test.md': 'テストの方針・計画',
}
const FILE_ORDER = Object.keys(FILE_LABELS)
/** 下書きのフォルダ。この順に、呼び名で出す */
const GROUP_LABELS = { search: '調査', spec: '変更仕様', impl: '実装の下書き', test: 'テストの下書き' }
const GROUP_ORDER = Object.keys(GROUP_LABELS)
/** 一覧に出さないフォルダ */
const SKIP = new Set(['images', 'cases', 'evidence'])
const MARKDOWN = /\.md$/i
// 出せる画像。エビデンスビューア(png・jpg・webp)より多いのはわざと。設計には、描いた図(svg)や動きの見本(gif)も置くため。
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i
/** 文書の中のリンク(画像は除く) */
const LINK = /(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g
/** URLから読む時に、リンクをたどって探す文書の数の上限 */
const CRAWL_LIMIT = 200
/** Driveから見出しを読む時に、同時に読む数 */
const PARALLEL = 6
/** 読んだ見出しを覚えておく場所(sessionStorage)。{ "<ファイルのID>@<更新日時>": 見出し }。変わっていない文書は読み直さない */
const HEADINGS_KEY = 'design:headings'
const NOT_FOUND = '設計の Markdown が見つかりません。フォルダのIDが正しいか、このGoogleアカウントで見られるフォルダかを確かめてください(index.md や spec.md などを置くと、ここに出ます)。'

const state = {
  source: null,
  /** パス → { path, label, id, modifiedTime, link(一覧の行) } */
  files: new Map(),
  current: '',
  /** 今開いている行 */
  row: null,
}

const groupOf = path => (path.includes('/') ? path.split('/')[0] : '')
const fileName = path => path.slice(path.lastIndexOf('/') + 1).replace(MARKDOWN, '')

/** 最初の # 見出し(記号を外したもの)。無ければ null */
function headingOf(body) {
  const m = /^#{1,6}\s+(.+)$/m.exec(body)
  return m ? m[1].replace(/[`*_[\]]/g, '').replace(/\(([^)]*)\)/g, '').trim() : null
}

function rank(order, key) {
  const index = order.indexOf(key)
  return index === -1 ? order.length : index
}

/** 一覧に並べる順。直下の決まったファイル → 直下のほか → 決まった下書きのフォルダ → ほかのフォルダ。同じ所はパスの順 */
function compare(a, b) {
  const ga = groupOf(a.path)
  const gb = groupOf(b.path)
  if (ga !== gb) {
    if (!ga || !gb) return ga ? 1 : -1
    return rank(GROUP_ORDER, ga) - rank(GROUP_ORDER, gb) || ga.localeCompare(gb)
  }
  return (ga ? 0 : rank(FILE_ORDER, a.path) - rank(FILE_ORDER, b.path)) || a.path.localeCompare(b.path)
}

/**
 * Driveのフォルダから文書を集める。直下を読んだ後、下書きのフォルダと evidence/ は1回の問い合わせでまとめて読む。
 * evidence/ の下のフォルダは、エビデンスビューアへのリンクにする
 */
async function collectFromDrive() {
  const root = await state.source.list('')
  const isDoc = entry => !entry.folder && MARKDOWN.test(entry.name)
  const docs = root.filter(isDoc).map(entry => ({ ...entry, path: entry.name }))
  const folders = root.filter(entry => entry.folder && !SKIP.has(entry.name)).map(entry => entry.name)
  const hasEvidence = root.some(entry => entry.folder && entry.name === 'evidence')
  const lists = await state.source.listMany([...folders, ...(hasEvidence ? ['evidence'] : [])])
  folders.forEach((folder, i) => docs.push(...lists[i].filter(isDoc).map(entry => ({ ...entry, path: `${folder}/${entry.name}` }))))
  const evidence = hasEvidence
    ? lists[folders.length].filter(entry => entry.folder)
        .map(folder => ({ name: folder.name, href: `../evidence/?folder=${encodeURIComponent(folder.id)}` }))
    : []
  return { docs, evidence }
}

/** URLから読む時は、フォルダの中身を一覧できない。決まったファイルから、相対リンクをたどって文書を集める(同じ深さのものはまとめて読む) */
async function collectFromUrl() {
  const docs = []
  const seen = new Set(FILE_ORDER)
  let level = [...FILE_ORDER]
  while (level.length && docs.length < CRAWL_LIMIT) {
    const bodies = await Promise.all(level.map(path => state.source.text(path).catch(() => null)))
    const next = []
    level.forEach((path, i) => {
      const body = bodies[i]
      if (body === null || docs.length >= CRAWL_LIMIT) return
      docs.push({ path, label: lookup(FILE_LABELS, path) ?? headingOf(body) ?? fileName(path) })
      for (const m of body.matchAll(LINK)) {
        const target = resolvePath(path, m[1])
        if (target && MARKDOWN.test(target) && !SKIP.has(groupOf(target)) && !seen.has(target)) {
          seen.add(target)
          next.push(target)
        }
      }
    })
    level = next
  }
  // 見本は、エビデンスビューアの見本につなぐ(同じ「アイデアを消す」話)
  return { docs, evidence: [{ name: '見本のテスト・エビデンス', href: '../evidence/?folder=sample' }] }
}

/** 一覧の呼び名を書き換える。開いている文書なら、帯の副題とタブの名前も */
function setLabel(path, label) {
  const file = state.files.get(path)
  if (!file || !label) return
  file.label = label
  if (file.link) file.link.textContent = label
  if (state.current === path) showLabel(path)
}

function showLabel(path) {
  const label = state.files.get(path)?.label ?? fileName(path)
  $('subtitle').textContent = label
  // 概要(index.md)を開いている時は、帯の見出しと文書の見出しが重なるので、副題を出さない
  $('subtitle').hidden = path === 'index.md'
  document.title = `${label} — 設計ビューア`
}

/** 見出しが分かった。index.md は帯の見出しに、ほかは一覧の呼び名に */
function gotHeading(path, heading) {
  if (!heading) return
  if (path === 'index.md') $('title').textContent = heading
  else if (!lookup(FILE_LABELS, path)) setLabel(path, heading)
}

function readHeadings() {
  try {
    return JSON.parse(sessionStorage.getItem(HEADINGS_KEY)) ?? {}
  }
  catch {
    return {}
  }
}

/**
 * Driveの文書の見出しを読み、届いた順に一覧を書き換える。同時に読むのは PARALLEL 本まで。
 * 覚えておいた見出しのうち、変わっていない文書(IDと更新日時が同じ)のものは読み直さない。
 */
async function loadHeadings() {
  const saved = readHeadings()
  const fresh = {}
  // 概要は帯の見出しに使うので、先に読む
  const files = [...state.files.values()]
    .filter(file => file.id && (file.path === 'index.md' || !lookup(FILE_LABELS, file.path)))
    .sort((a, b) => (b.path === 'index.md') - (a.path === 'index.md'))
  const queue = []
  for (const file of files) {
    const key = `${file.id}@${file.modifiedTime}`
    if (Object.hasOwn(saved, key)) {
      fresh[key] = saved[key]
      gotHeading(file.path, saved[key])
    }
    else queue.push({ file, key })
  }
  const worker = async () => {
    while (queue.length) {
      const { file, key } = queue.shift()
      try {
        fresh[key] = headingOf(await state.source.text(file.path)) ?? ''
        gotHeading(file.path, fresh[key])
      }
      catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker))
  try {
    sessionStorage.setItem(HEADINGS_KEY, JSON.stringify(fresh))
  }
  catch {}
}

function renderList(order, evidence) {
  const nav = $('files')
  nav.replaceChildren()
  let group = null
  let list = null
  for (const file of order) {
    const g = groupOf(file.path)
    if (!list || g !== group) {
      group = g
      if (g) nav.append(el('h2', { text: lookup(GROUP_LABELS, g) ?? `${g}/`, className: 'section-title', attrs: { title: `${g}/` } }))
      list = el('ul', { className: 'items' })
      nav.append(list)
    }
    file.link = el('a', {
      text: file.label,
      className: 'item plain',
      attrs: { href: `#file=${encodeURIComponent(file.path)}`, title: file.path },
    })
    list.append(el('li', {}, [file.link]))
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
  state.row = setCurrent(state.row, state.files.get(path)?.link, 'page')
  showLabel(path)

  const doc = $('doc')
  try {
    const body = await state.source.text(path)
    if (state.current !== path) return
    doc.replaceChildren(renderMarkdown(body, {
      link(href) {
        if (isWebUrl(href)) return href
        // ほかの文書はこのビューアで開く。それ以外(Driveの中のファイル)はURLで開けないので、リンクにしない。
        const target = resolvePath(path, href)
        return target && MARKDOWN.test(target) ? `#file=${encodeURIComponent(target)}` : null
      },
      image(src) {
        const target = resolvePath(path, src)
        return target && IMAGE.test(target) ? state.source.url(target) : null
      },
    }))
    announce(`${headingOf(body) ?? state.files.get(path)?.label ?? fileName(path)} を開きました`)
  }
  catch (error) {
    if (state.current !== path) return
    doc.replaceChildren(el('p', { text: error.message, className: 'muted' }))
  }
  doc.closest('.stage').scrollTop = 0
}

function fromHash() {
  return new URLSearchParams(location.hash.slice(1)).get('file') ?? ''
}

async function load(source) {
  state.source = source
  let collected
  try {
    collected = await (source.list ? collectFromDrive() : collectFromUrl())
  }
  catch (error) {
    throw new Error(error.code === 'not-found' ? NOT_FOUND : error.message)
  }
  if (!collected.docs.length && !collected.evidence.length) throw new Error(NOT_FOUND)

  // 一覧はファイル名(決まったファイルは呼び名)ですぐ出し、見出しは後から書き換える。並べ替えは一度だけ
  for (const doc of collected.docs) {
    const label = doc.label ?? lookup(FILE_LABELS, doc.path) ?? fileName(doc.path)
    state.files.set(doc.path, { path: doc.path, label, id: doc.id, modifiedTime: doc.modifiedTime, link: null })
  }
  const order = [...state.files.values()].sort(compare)
  renderList(order, collected.evidence)
  showViewer()

  if (source.list) loadHeadings()
  else if (state.files.has('index.md')) source.text('index.md').then(body => gotHeading('index.md', headingOf(body)), () => {})

  addEventListener('hashchange', () => {
    const path = fromHash()
    if (path && path !== state.current) open(path)
  })
  const wanted = fromHash()
  const path = (wanted && (state.files.has(wanted) || MARKDOWN.test(wanted)) && wanted) || order[0]?.path
  if (path) open(path)
  else $('doc').replaceChildren(el('p', { text: '左の一覧から、テスト・エビデンスを開いてください。', className: 'muted' }))
}

startViewer({ sample: 'design', load })
