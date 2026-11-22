// エビデンスビューア。Driveのフォルダ(またはURL)から manifest.json と動画・画像・テキストを読んで、項目の一覧から見て回る。
// テストケース(result の無い、未実施の項目)も同じ形で読み、前提・手順・期待する結果を出す。
// manifest.json の形は docs/evidence-manifest.md。
//
// 読み込んだ文字は textContent でだけ出す(HTMLとして解釈しない)。他人が作ったフォルダを
// 開かされても、ログインの情報を抜かれないようにするため。

import { el, inline } from '../lib/drive.js'
import { showGate, showViewer, sourceFromLocation } from '../lib/page.js'

// 結果の印。ほとんどが期待どおりなので、期待どおりは控えめにし、そうでないものを目立たせる(style.css)。
const MARK = { ok: '✓', partial: '!', ng: '✕' }
const LABEL = { ok: '期待どおり', partial: '一部だけ確認', ng: '期待どおりでない', pending: '未実施' }
/** 確認の行(checks)の頭に書かれた結果の記号 */
const CHECK_RESULT = { '○': 'ok', '✓': 'ok', '△': 'partial', '!': 'partial', '×': 'ng', '✕': 'ng' }
/** 次へ/前へで止まるもの(項目)。添付のテキストは飛ばす */
const STOPS = new Set(['video', 'image', 'case'])
/** 添付の一覧に出す、何として開くかの印 */
const KIND_MARK = { video: '▶', image: '▣', text: '≡' }
const SECTION_KIND = {
  setup: '準備',
  unit: '単体',
  integration: '結合',
  regression: '回帰',
  acceptance: '受け入れ',
  cleanup: '後始末',
}
const PRIORITY = { high: '優先度 高', mid: '優先度 中', low: '優先度 低' }

const $ = id => document.getElementById(id)

const state = {
  source: null,
  /** 一覧に並ぶ順の、開けるもの(項目のすべてと、添付のすべて) */
  playlist: [],
  current: -1,
  blobs: new Map(),
}

/** 結果の印。色だけでなく記号の形でも見分けられるようにし、読み上げには言葉を渡す */
function mark(result) {
  if (!MARK[result]) return el('span', { text: '・', className: 'mark pending', attrs: { 'role': 'img', 'aria-label': LABEL.pending, 'title': LABEL.pending } })
  return el('span', { text: MARK[result], className: `mark ${result}`, attrs: { 'role': 'img', 'aria-label': LABEL[result], 'title': LABEL[result] } })
}

/** 確認の行。頭の ○ / △ / × は、一覧と同じ印にして本文から外す */
function check(text) {
  const head = /^([○✓△!×✕])\s*/.exec(text)
  const result = head && CHECK_RESULT[head[1]]
  return el('li', {}, [result ? mark(result) : el('span', { className: 'mark' }), el('span', {}, inline(result ? text.slice(head[0].length) : text))])
}

/** ファイル名の拡張子から、何として開くかを決める */
function kindOf(file) {
  if (/\.(webm|mp4|mov)$/i.test(file)) return 'video'
  if (/\.(png|jpe?g|webp)$/i.test(file)) return 'image'
  return 'text'
}

const asList = value => (value === undefined || value === null ? [] : [].concat(value))

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

  $('notes').replaceChildren(...asList(manifest.notes).map(note => el('li', {}, inline(note))))

  const requirements = asList(manifest.requirements)
  $('requirements').replaceChildren(...requirements.map(requirement => el('li', {}, [
    el('span', { text: requirement.id ?? '', className: 'item-id' }),
    el('span', {}, inline(requirement.text ?? '')),
  ])))
  $('requirements-title').hidden = !requirements.length

  // 件数は、行わない項目(duplicateOf)を除いて数える。未実施の数はビューアが数える
  const counts = { ok: 0, partial: 0, ng: 0, pending: 0 }
  const sections = $('sections')
  sections.replaceChildren()
  for (const section of asList(manifest.sections)) {
    const kind = SECTION_KIND[section.kind]
    sections.append(el('h2', { className: 'section-title' }, [
      section.title ?? '',
      ...(kind ? [el('span', { text: kind, className: 'tag section-kind' })] : []),
    ]))
    const list = el('ul', { className: 'items' })
    for (const item of asList(section.items)) {
      if (!item.duplicateOf) counts[MARK[item.result] ? item.result : 'pending'] += 1
      // 1つの項目が持つのは動画か画像のどちらか(両方あれば動画を見せる)。どちらも無い項目は、前提・手順などだけを出す。
      const file = item.video ?? item.image
      const entryKind = item.video ? 'video' : item.image ? 'image' : 'case'
      const index = state.playlist.push({ kind: entryKind, file, item, section }) - 1
      const classes = ['item', item.result ?? '', item.duplicateOf ? 'duplicate' : ''].filter(Boolean).join(' ')
      const button = el('button', {
        className: classes,
        attrs: { 'type': 'button', 'data-index': String(index), 'title': item.duplicateOf ? `${item.duplicateOf} で確かめるので行わない` : LABEL[item.result] ?? LABEL.pending },
      }, [
        el('span', { text: item.id ?? '', className: 'item-id' }),
        mark(item.result),
        el('span', { className: 'item-title' }, inline(item.title ?? '')),
      ])
      button.addEventListener('click', () => select(index))
      list.append(el('li', {}, [button]))
    }
    sections.append(list)
  }

  // 見出しの横の件数。書かれた summary より、項目から数えた値を出す(未実施は数えないと分からないため)
  const shown = ['ok', 'partial', 'ng', ...(counts.pending ? ['pending'] : [])]
  if (counts.ok + counts.partial + counts.ng + counts.pending) {
    $('summary').replaceChildren(...shown.map(result => el('span', { className: 'count', attrs: { title: LABEL[result] } }, [mark(result === 'pending' ? undefined : result), String(counts[result])])))
    $('summary').hidden = false
  }

  const attachments = $('attachments')
  attachments.replaceChildren()
  for (const attachment of asList(manifest.attachments)) {
    const kind = kindOf(attachment.file)
    const entry = { kind, file: attachment.file, item: { title: attachment.title } }
    const index = state.playlist.push(entry) - 1
    const button = el('button', { className: 'item', attrs: { 'type': 'button', 'data-index': String(index) } }, [
      el('span', { className: 'item-id' }),
      el('span', { text: KIND_MARK[kind], className: 'mark' }),
      el('span', { text: attachment.title, className: 'item-title' }),
    ])
    button.addEventListener('click', () => select(index))
    attachments.append(el('li', {}, [button]))
  }
  $('attachments-title').hidden = !asList(manifest.attachments).length

  showViewer()
}

/** テストケースの欄(前提・手順・期待する結果・根拠) */
function caseFields(item) {
  const fields = []
  const add = (label, node) => fields.push(el('dt', { text: label }), el('dd', {}, [node]))
  if (item.duplicateOf) add('行わない', el('span', {}, [`${item.duplicateOf} で確かめるので、この項目は行わない`]))
  if (item.given) add('前提', el('span', {}, inline(item.given)))
  const steps = asList(item.steps)
  if (steps.length) add('手順', steps.length > 1 ? el('ol', {}, steps.map(step => el('li', {}, inline(step)))) : el('span', {}, inline(steps[0])))
  const expect = asList(item.expect)
  if (expect.length) add('期待する結果', expect.length > 1 ? el('ul', {}, expect.map(line => el('li', {}, inline(line)))) : el('span', {}, inline(expect[0])))
  if (item.basis) add('根拠', el('details', {}, [el('summary', { text: '開く' }), el('span', {}, inline(item.basis))]))
  return fields
}

async function select(index) {
  const entry = state.playlist[index]
  if (!entry) return
  state.current = index
  remember(index)

  for (const button of document.querySelectorAll('.item[data-index]')) {
    button.classList.toggle('current', button.dataset.index === String(index))
  }
  document.querySelector(`.item[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })

  const { item } = entry
  const isItem = entry.kind === 'case' || entry.section
  const heading = [item.id && `#${item.id}`, item.title].filter(Boolean).join(' ')
  $('item-title').replaceChildren(...(isItem ? [mark(item.result)] : []), el('span', {}, inline(heading)))
  $('item-title').classList.toggle('with-mark', Boolean(isItem))

  const tags = [
    ...(PRIORITY[item.priority] ? [PRIORITY[item.priority]] : []),
    ...asList(item.requirement).map(id => `要件 ${id}`),
  ]
  $('item-tags').replaceChildren(...tags.map(tag => el('span', { text: tag, className: 'tag' })))
  $('item-tags').hidden = !tags.length
  $('case-fields').replaceChildren(...caseFields(item))
  $('item-checks').replaceChildren(...asList(item.checks).map(check))
  $('checks-title').hidden = !asList(item.checks).length
  $('item-note').textContent = item.note ? `※ ${item.note}` : ''
  $('item-note').hidden = !item.note

  const player = $('player')
  const image = $('image')
  const text = $('text')
  const noMedia = $('no-media')
  // 動画・画像・テキストは同じ場所に出す。ひとつだけ出し、動画は映っていない間は止めておく。
  const show = (shown) => {
    if (shown !== player) player.pause()
    for (const node of [player, image, text, noMedia]) node.hidden = node !== shown
  }
  try {
    if (entry.kind === 'case') {
      noMedia.textContent = item.duplicateOf ? 'ほかの項目で確かめるので、行いません。'
        : MARK[item.result] ? '動画・画像はありません。' : 'まだ行っていません。'
      show(noMedia)
      return
    }
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
    if (next && (next.kind === 'video' || next.kind === 'image')) blobUrl(next.file).catch(() => {})
  }
  catch (error) {
    show(text)
    text.textContent = error.message
  }
}

function step(delta) {
  let index = state.current + delta
  while (state.playlist[index] && !STOPS.has(state.playlist[index].kind)) index += delta
  if (state.playlist[index]) select(index)
}

/** 見ている項目を、URLの # に残す(ログインし直した時や、URLを渡した時に、その項目から開く) */
function remember(index) {
  history.replaceState(null, '', `${location.pathname}${location.search}#item=${index}`)
}

async function start() {
  $('player').addEventListener('ended', () => {
    if ($('continuous').checked) step(1)
  })
  $('prev').addEventListener('click', () => step(-1))
  $('next').addEventListener('click', () => step(1))

  const source = sourceFromLocation()
  if (!source) return
  state.source = source
  showGate('読み込み中...')
  try {
    const manifest = await (await source.file('manifest.json')).json()
    render(manifest)
  }
  catch (error) {
    showGate(error.message)
    return
  }
  const item = new URLSearchParams(location.hash.slice(1)).get('item')
  const wanted = item === null ? -1 : Number(item)
  const first = state.playlist.findIndex(entry => entry.kind === 'video' || entry.kind === 'image')
  select(state.playlist[wanted] ? wanted : Math.max(first, 0))
}

start()
