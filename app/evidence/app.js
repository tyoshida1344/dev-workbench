// エビデンスビューア。Driveのフォルダ(またはURL)から manifest.json と動画・画像・テキストを読んで、項目の一覧から見て回る。
// テストケース(result の無い、未実施の項目)も同じ形で読み、前提・手順・期待する結果を出す。
// manifest.json の形は docs/evidence-manifest.md。
//
// 読み込んだ文字は textContent でだけ出す(HTMLとして解釈しない)。他人が作ったフォルダを
// 開かされても、ログインの情報を抜かれないようにするため。

import { $, el, inline, setCurrent } from '../_lib/dom.js'
import { announce, showViewer, startViewer } from '../_lib/page.js'
import { isWebUrl, lookup } from '../_lib/path.js'

/** 項目に書ける結果 */
const RESULTS = ['ok', 'partial', 'ng']
// 項目の状態の印。ほとんどが期待どおりなので、期待どおりは控えめにし、そうでないものを目立たせる(style.css)。
// pending は未実施、skip はほかの項目で確かめるので行わない項目(duplicateOf)。
const MARK = { ok: '✓', partial: '!', ng: '✕', pending: '・', skip: '−' }
const LABEL = { ok: '期待どおり', partial: '一部だけ確認', ng: '期待どおりでない', pending: '未実施', skip: '行わない' }
/** 確認の行(checks)の頭に書かれた結果の記号 */
const CHECK_RESULT = { '○': 'ok', '✓': 'ok', '△': 'partial', '!': 'partial', '×': 'ng', '✕': 'ng' }
/** 一覧に出す、何として開くかの印と言葉 */
const KIND_MARK = { video: '▶', image: '▣', text: '≡' }
const KIND_LABEL = { video: '動画', image: '画像', text: 'テキスト' }
const SECTION_KIND = {
  setup: '準備',
  unit: '単体テスト',
  integration: '結合テスト',
  regression: '回帰テスト',
  acceptance: '受け入れテスト',
  cleanup: '後始末',
}
const PRIORITY = { high: '優先度 高', mid: '優先度 中', low: '優先度 低' }
// 出せる動画と画像。docs/evidence-manifest.md の決まりどおり。
// 設計ビューアの画像(gif・svg も出す)より少ないのはわざと。エビデンスは画面を撮ったものなので、撮った形式だけにしている。
const VIDEO = /\.(webm|mp4|mov)$/i
const IMAGE = /\.(png|jpe?g|webp)$/i
const BAD_MANIFEST = 'manifest.json の書き方に誤りがあります。'
const NOT_FOUND = 'manifest.json が見つかりません。フォルダのIDが正しいか、このGoogleアカウントで見られるフォルダかを確かめてください。'
/** 見つからない時のエラー。code を残す(Driveのフォルダなら、次のログインでアカウントを選べるようにするため) */
const notFound = () => Object.assign(new Error(NOT_FOUND), { code: 'not-found' })
/** 狭い幅。一覧の上の注意書きと要件を畳む */
const NARROW = matchMedia('(max-width: 760px)')

const state = {
  source: null,
  /** 一覧に並ぶ順の、開けるもの(項目のすべてと、添付のすべて)。{ kind, file, item, section, row, stop } */
  playlist: [],
  current: -1,
  /** 今開いている行(一覧のボタン) */
  row: null,
  /** 読み込みの番号。開くたびに増やし、読み終えた時に変わっていれば出さない(読み込み中に別の項目を押した時は、後のものを出す) */
  loading: 0,
  /** blob の URL を作ったファイル。今の項目と、その前後だけを残す */
  loaded: new Set(),
}

const asList = value => (value === undefined || value === null ? [] : [].concat(value))
/** オブジェクトの並び。null や、オブジェクトでないもの(壊れた manifest)は飛ばす */
const objects = value => asList(value).filter(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
const str = value => (value === undefined || value === null ? '' : String(value))
/** 項目の状態(ok / partial / ng / pending / skip) */
const statusOf = item => (item.duplicateOf ? 'skip' : RESULTS.includes(item.result) ? item.result : 'pending')

/** 状態の印。色だけでなく記号の形でも見分けられるようにし、読み上げには言葉を渡す。横に言葉を添える時は、読み上げない(decorative) */
function mark(status, { decorative = false } = {}) {
  const attrs = decorative ? { 'aria-hidden': 'true' } : { 'role': 'img', 'aria-label': LABEL[status], 'title': LABEL[status] }
  return el('span', { text: MARK[status], className: `mark ${status}`, attrs })
}

/** 確認の行。頭の ○ / △ / × は、一覧と同じ印にして本文から外す。印の無い行は、印の場所に ・ を出す */
function check(line) {
  const value = str(line)
  const head = /^([○✓△!×✕])\s*/.exec(value)
  const result = head && lookup(CHECK_RESULT, head[1])
  return el('li', {}, [
    result ? mark(result) : el('span', { text: '・', className: 'mark', attrs: { 'aria-hidden': 'true' } }),
    el('span', {}, inline(result ? value.slice(head[0].length) : value)),
  ])
}

/** 何として開くかの札。記号の形と言葉の両方で出し、押す前に動画か画像かが分かるようにする */
function kindBadge(kind) {
  return el('span', { className: `tag kind ${kind}` }, [
    el('span', { text: KIND_MARK[kind], attrs: { 'aria-hidden': 'true' } }),
    KIND_LABEL[kind],
  ])
}

/** 動画も画像も無い項目の札。出すものが無いのではなく、まだ行っていないことを示す */
function statusBadge(status) {
  return el('span', { text: LABEL[status], className: `tag kind ${status}` })
}

/** ファイル名の拡張子から、何として開くかを決める */
function kindOf(file) {
  if (VIDEO.test(file)) return 'video'
  if (IMAGE.test(file)) return 'image'
  return 'text'
}

/** 一覧の行(押すと開く)。押されたのは親の #list の1か所で受ける */
function row(index, className, title, children) {
  return el('li', {}, [el('button', { className, attrs: { 'type': 'button', 'data-index': String(index), ...(title ? { title } : {}) } }, children)])
}

/** 一覧の上の注意書きと要件。狭い幅では畳む(初めは閉じる) */
function fold() {
  $('overview').open = !NARROW.matches
}

function render(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(BAD_MANIFEST)
  const title = str(manifest.title) || 'エビデンスビューア'
  document.title = `${title} — エビデンスビューア`
  $('title').textContent = title

  const source = objects(manifest.source)[0]
  if (source && isWebUrl(source.url)) {
    const link = $('source')
    link.href = source.url
    link.textContent = [source.repository, source.commit && `commit ${source.commit}`, manifest.recordedAt].filter(Boolean).map(str).join(' / ') || source.url
    link.hidden = false
  }

  const notes = asList(manifest.notes).filter(note => note !== null)
  $('notes').replaceChildren(...notes.map(note => el('li', {}, inline(str(note)))))
  $('notes').hidden = !notes.length
  const requirements = objects(manifest.requirements)
  $('requirements').replaceChildren(...requirements.map(requirement => el('li', {}, [
    el('span', { text: str(requirement.id), className: 'item-id' }),
    el('span', {}, inline(str(requirement.text))),
  ])))
  $('requirements-title').hidden = !requirements.length
  $('overview').hidden = !notes.length && !requirements.length
  fold()
  NARROW.addEventListener('change', fold)

  // 件数は、行わない項目(duplicateOf)を除いて数える。未実施の数はビューアが数える
  const counts = { ok: 0, partial: 0, ng: 0, pending: 0, skip: 0 }
  const sections = $('sections')
  sections.replaceChildren()
  for (const section of objects(manifest.sections)) {
    const kind = lookup(SECTION_KIND, section.kind)
    sections.append(el('h2', { className: 'section-title' }, [
      str(section.title),
      ...(kind ? [el('span', { text: kind, className: 'tag section-kind' })] : []),
    ]))
    const list = el('ul', { className: 'items' })
    for (const item of objects(section.items)) {
      const status = statusOf(item)
      counts[status] += 1
      // 1つの項目が持つのは動画か画像のどちらか(両方あれば動画を見せる)。どちらも無い項目は、前提・手順などだけを出す。
      const file = item.video ? str(item.video) : item.image ? str(item.image) : undefined
      const entryKind = item.video ? 'video' : item.image ? 'image' : 'case'
      const index = state.playlist.length
      const title = status === 'skip' ? `${str(item.duplicateOf)} で確かめるので行わない` : LABEL[status]
      // 行の右端の札。動画・画像を持つ項目はそれを、持たない未実施・行わない項目は状態を出す(押す前に、何が出るかが分かるように)。
      // 状態を言葉で出す行は、同じことを二度言わないよう印を出さない(列は空けたままにして、文の頭をほかの行とそろえる)
      const statusAsTag = !file && (status === 'pending' || status === 'skip')
      const badge = file ? kindBadge(entryKind) : statusAsTag ? statusBadge(status) : null
      const node = row(index, `item ${status}`, title, [
        el('span', { text: str(item.id), className: 'item-id' }),
        statusAsTag ? el('span', { className: 'mark' }) : mark(status),
        el('span', { className: 'item-title' }, inline(str(item.title))),
        ...(badge ? [badge] : []),
      ])
      list.append(node)
      state.playlist.push({ kind: entryKind, file, item, section, row: node.firstChild, stop: status !== 'skip' })
    }
    sections.append(list)
  }

  // 見出しの横の件数。書かれた summary より、項目から数えた値を出す(未実施は数えないと分からないため)。印だけでなく、言葉も添える
  if (counts.ok + counts.partial + counts.ng + counts.pending) {
    $('summary').replaceChildren(
      ...RESULTS.map(result => el('span', { className: 'count' }, [mark(result, { decorative: true }), `${LABEL[result]} ${counts[result]}`])),
      ...(counts.pending ? [el('span', { text: `${LABEL.pending} ${counts.pending}`, className: 'count' })] : []),
    )
    $('summary').hidden = false
  }

  const attachments = objects(manifest.attachments).filter(attachment => typeof attachment.file === 'string' && attachment.file)
  $('attachments').replaceChildren(...attachments.map((attachment) => {
    const kind = kindOf(attachment.file)
    const index = state.playlist.length
    const node = row(index, 'item', '', [
      el('span', { className: 'item-id' }),
      el('span', { className: 'mark' }),
      el('span', { text: str(attachment.title) || attachment.file, className: 'item-title' }),
      kindBadge(kind),
    ])
    state.playlist.push({ kind, file: attachment.file, item: { title: str(attachment.title) || attachment.file }, row: node.firstChild, stop: kind !== 'text' })
    return node
  }))
  $('attachments-title').hidden = !attachments.length

  showViewer()
}

/** テストケースの欄(行わない・前提・手順・期待する結果・根拠) */
function caseFields(item) {
  const fields = []
  const add = (label, node) => fields.push(el('dt', { text: label }), el('dd', {}, [node]))
  if (item.duplicateOf) {
    // 行う側の項目を押して開けるようにする
    const id = str(item.duplicateOf)
    const target = state.playlist.findIndex(entry => entry.section && str(entry.item.id) === id)
    const ref = target === -1 ? `項目 ${id}` : el('button', { text: `項目 ${id}`, className: 'link-button', attrs: { 'type': 'button', 'data-index': String(target) } })
    add('行わない', el('span', {}, [ref, ' で確かめるので、この項目は行わない']))
  }
  if (item.given) add('前提', el('span', {}, inline(str(item.given))))
  const steps = asList(item.steps).map(str)
  if (steps.length) add('手順', steps.length > 1 ? el('ol', {}, steps.map(step => el('li', {}, inline(step)))) : el('span', {}, inline(steps[0])))
  const expect = asList(item.expect).map(str)
  if (expect.length) add('期待する結果', expect.length > 1 ? el('ul', {}, expect.map(line => el('li', {}, inline(line)))) : el('span', {}, inline(expect[0])))
  if (item.basis) add('根拠', el('details', {}, [el('summary', { text: '表示' }), el('span', {}, inline(str(item.basis)))]))
  return fields
}

/** from から delta の向きに、次に止まるものの番号。行わない項目と添付のテキストは飛ばす。media なら動画・画像のあるものだけ。無ければ -1 */
function near(from, delta, media = false) {
  for (let i = from + delta; i >= 0 && i < state.playlist.length; i += delta) {
    const entry = state.playlist[i]
    if (entry.stop && (!media || entry.kind === 'video' || entry.kind === 'image')) return i
  }
  return -1
}

/** 移る先が無い時は、次へ/前へを押せなくする */
function updateSteps() {
  $('prev').disabled = near(state.current, -1) === -1
  $('next').disabled = near(state.current, 1) === -1
}

/** blob の URL は、今の項目・次に先読みした項目・前の項目の分だけを残し、ほかは放す(メモリを使い続けないように) */
function keepAround(index) {
  const keep = new Set([index, near(index, -1, true), near(index, 1, true)].map(i => state.playlist[i]?.file).filter(Boolean))
  for (const file of state.loaded) {
    if (keep.has(file)) continue
    state.source.release(file)
    state.loaded.delete(file)
  }
}

/** 見ているものを、URLの # に残す(読み直した時や、URLを渡した時に、そこから開く)。項目は id で、id の無いものは並びの番号で */
function remember(entry, index) {
  const hash = entry.section && str(entry.item.id) ? `item=${encodeURIComponent(str(entry.item.id))}` : `index=${index}`
  history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`)
}

/** URLの # が指すものの番号。無ければ -1 */
function fromHash() {
  const hash = new URLSearchParams(location.hash.slice(1))
  const id = hash.get('item')
  if (id !== null) {
    const index = state.playlist.findIndex(entry => entry.section && str(entry.item.id) === id)
    // 前の版は #item= に並びの番号を書いていた
    return index !== -1 ? index : /^\d+$/.test(id) ? Number(id) : -1
  }
  const index = hash.get('index')
  return index !== null && /^\d+$/.test(index) ? Number(index) : -1
}

async function select(index) {
  const entry = state.playlist[index]
  if (!entry) return
  const ticket = ++state.loading
  const stillHere = () => ticket === state.loading
  state.current = index
  state.row = setCurrent(state.row, entry.row)
  remember(entry, index)
  updateSteps()

  const { item } = entry
  const status = entry.section ? statusOf(item) : null
  const heading = [entry.section && str(item.id) && `項目 ${str(item.id)}`, str(item.title)].filter(Boolean).join(' ')
  $('item-title').replaceChildren(
    ...(status ? [mark(status)] : []),
    el('span', {}, [...inline(heading), ...(status === 'pending' ? [' ', el('span', { text: LABEL.pending, className: 'tag' })] : [])]),
  )
  $('item-title').classList.toggle('with-mark', Boolean(status))
  announce(`${heading.replaceAll('`', '')} を開きました`)

  const tags = [lookup(PRIORITY, item.priority), ...asList(item.requirement).map(id => `要件 ${str(id)}`)].filter(Boolean)
  $('item-tags').replaceChildren(...tags.map(tag => el('span', { text: tag, className: 'tag' })))
  $('item-tags').hidden = !tags.length
  $('case-fields').replaceChildren(...caseFields(item))
  const checks = asList(item.checks)
  $('item-checks').replaceChildren(...checks.map(check))
  $('checks-title').hidden = !checks.length
  $('item-note').textContent = item.note ? `※ ${str(item.note)}` : ''
  $('item-note').hidden = !item.note

  const player = $('player')
  const image = $('image')
  const text = $('text')
  const message = $('no-media')
  // 動画・画像・テキストは同じ場所に出す。ひとつだけ出す(null なら何も出さない)。
  const show = (shown) => {
    for (const node of [player, image, text, message]) node.hidden = node !== shown
  }
  const say = (words, node = message) => {
    node.textContent = words
    show(node)
  }
  // 前の動画は、選んだらすぐ止める(読み込みを待つ間に、前のものが鳴り続けないように)
  player.pause()
  keepAround(index)

  if (entry.kind === 'case') {
    // 未実施・行わない項目は、前提・手順を上に出すため、動画の場所には何も出さない
    if (status === 'pending' || status === 'skip') show(null)
    else say('動画・画像はありません。')
    return
  }

  say('読み込み中...')
  try {
    if (entry.kind === 'text') {
      const body = await state.source.text(entry.file)
      if (stillHere()) say(body, text)
      return
    }
    state.loaded.add(entry.file)
    const url = await state.source.url(entry.file)
    if (!stillHere()) return
    const failed = () => {
      if (stillHere()) say(`${entry.file} を出せませんでした。`, text)
    }
    if (entry.kind === 'image') {
      image.alt = str(item.title)
      image.onload = () => {
        if (stillHere()) show(image)
      }
      image.onerror = failed
      // 同じ画像を開き直した時は、読み終えたことの知らせが来ないことがあるので、すぐ出す
      if (image.src === url && image.complete && image.naturalWidth) show(image)
      else image.src = url
    }
    else {
      player.onerror = failed
      player.src = url
      show(player)
      player.play().catch(() => {})
    }
    // 連続再生で間が空かないよう、次に見るものを先に読んでおく。
    const next = state.playlist[near(index, 1, true)]
    if (next) {
      state.loaded.add(next.file)
      state.source.url(next.file).catch(() => {})
    }
  }
  catch (error) {
    if (stillHere()) say(error.message, text)
  }
}

function step(delta, media = false) {
  const index = near(state.current, delta, media)
  if (index !== -1) select(index)
}

async function load(source) {
  state.source = source
  let manifest
  try {
    manifest = JSON.parse(await source.text('manifest.json'))
  }
  catch (error) {
    throw error.code === 'not-found' ? notFound() : new Error(error instanceof SyntaxError ? BAD_MANIFEST : error.message)
  }
  try {
    render(manifest)
  }
  catch (error) {
    // 形がおかしい manifest は、英語のエラー(TypeError など)ではなく、書き方の誤りとして出す
    console.error(error)
    throw new Error(BAD_MANIFEST)
  }
  updateSteps()
  const wanted = fromHash()
  select(state.playlist[wanted] ? wanted : Math.max(near(-1, 1, true), 0))
}

// 一覧の行と、詳細の「行う側の項目」のボタンは、ここでまとめて受ける
for (const area of [$('list'), $('case-fields')]) {
  area.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]')
    if (button) select(Number(button.dataset.index))
  })
}
// 連続再生は、動画が終わったら、次の動画・画像のある項目まで飛ばして進む(画像では勝手に進まない)
$('player').addEventListener('ended', () => {
  if ($('continuous').checked) step(1, true)
})
$('prev').addEventListener('click', () => step(-1))
$('next').addEventListener('click', () => step(1))

startViewer({ sample: 'evidence', load })
