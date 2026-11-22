// Markdown を画面の要素にする。設計の文書を読むための、最小の描画。
// 対応: 見出し・段落・箇条書き(入れ子も)・番号付き・表・コードブロック・引用・水平線と、行内の強調・斜体・コード・リンク・画像。
// 対応していない記法は、素の文として出す(取りこぼしても、読めなくならないことを優先する)。
//
// 文字はすべて textContent で入れる。HTMLは書いてあっても文字のまま出す(他人の文書を開かされても、ログインの情報を抜かれないように)。

import { el } from './dom.js'
import { isWebUrl } from './path.js'

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/
const ORDERED = /^\s*\d+[.)]/
/** 段落を終わらせる、ほかのかたまりの始まり(見出し・コードブロック・引用・表) */
const BLOCK_START = /^(?:#{1,6}\s|\s*```|>\s?|\s*\|)/
/** 表の区切りの行(|---|---|) */
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/
const indentOf = line => line.match(/^\s*/)[0].length

/**
 * 行内の記法。先に現れたものから順に切り出す。
 * options.link(href) は開いてよいリンク先を返す(開かないなら null)。options.image(src) は画像のURLの約束を返す(出さないなら null)。
 * (dom.js の inline は `…` だけを見る。こちらは Markdown の行内の記法をすべて見るので、名前を分けている)
 */
const INLINE = [
  { re: /`([^`]+)`/, make: m => el('code', { text: m[1] }) },
  { re: /!\[([^\]]*)\]\(([^)\s]+)\)/, make: (m, options) => image(m[2], m[1], options) },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: (m, options) => link(m[2], m[1], options) },
  { re: /\*\*([^*]+)\*\*/, make: (m, options) => el('strong', {}, spans(m[1], options)) },
  { re: /(?<![*\w])\*([^*\n]+)\*(?![*\w])/, make: (m, options) => el('em', {}, spans(m[1], options)) },
]

function spans(text, options) {
  const out = []
  let rest = text
  while (rest) {
    let first = null
    for (const rule of INLINE) {
      const m = rule.re.exec(rest)
      if (m && (!first || m.index < first.m.index)) first = { m, rule }
    }
    if (!first) {
      out.push(rest)
      break
    }
    if (first.m.index) out.push(rest.slice(0, first.m.index))
    out.push(first.rule.make(first.m, options))
    rest = rest.slice(first.m.index + first.m[0].length)
  }
  return out
}

function link(href, label, options) {
  const resolved = options.link?.(href) ?? null
  if (!resolved) return el('span', {}, spans(label, options))
  return el('a', { attrs: { href: resolved, ...(isWebUrl(resolved) ? { target: '_blank', rel: 'noopener' } : {}) } }, spans(label, options))
}

/** 画像は、見える所まで来てから読む(長い文書で、見ない画像まで一度に読まない) */
let watcher = null
/** 見張っている画像 → 見えた時に読む関数 */
const loaders = new WeakMap()
function whenVisible(node, load) {
  if (typeof IntersectionObserver !== 'function') {
    load()
    return
  }
  watcher ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      watcher.unobserve(entry.target)
      loaders.get(entry.target)?.()
      loaders.delete(entry.target)
    }
  }, { rootMargin: '200px 0px' })
  loaders.set(node, load)
  watcher.observe(node)
}

function image(src, alt, options) {
  // 外の画像は読み込まない(開いた人のIPアドレスなどが、外のサーバーに届かないように)。押せば新しいタブで開く。
  if (isWebUrl(src)) return el('a', { text: `[外の画像: ${alt || src}]`, attrs: { href: src, target: '_blank', rel: 'noopener' } })
  if (!options.image) return el('span', { text: `[画像: ${alt || src}]`, className: 'muted' })
  const img = el('img', { attrs: { alt } })
  const failed = () => img.replaceWith(el('span', { text: `[画像を読めませんでした: ${src}]`, className: 'muted' }))
  whenVisible(img, () => {
    const url = options.image(src)
    if (!url) {
      img.replaceWith(el('span', { text: `[画像: ${alt || src}]`, className: 'muted' }))
      return
    }
    img.addEventListener('error', failed, { once: true })
    Promise.resolve(url).then((value) => { img.src = value }).catch(failed)
  })
  return img
}

/** 箇条書き・番号付き。字下げで入れ子にする。[要素, 次に読む行] を返す */
function list(lines, start, options) {
  const base = indentOf(lines[start])
  const ordered = ORDERED.test(lines[start])
  const node = el(ordered ? 'ol' : 'ul')
  let current = null
  let body = []
  const flush = () => {
    if (current) current.prepend(...spans(body.join(' '), options))
  }
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    // 空行: 次もこのリストなら続ける
    if (!line.trim()) {
      if (ITEM.test(lines[i + 1] ?? '') && indentOf(lines[i + 1]) >= base) {
        i++
        continue
      }
      break
    }
    const indent = indentOf(line)
    // 同じ字下げで種類が変わったら、別のリストにする(- と 1. を混ぜない)
    if (indent === base && ITEM.test(line) && ORDERED.test(line) !== ordered) break
    if (indent > base && ITEM.test(line)) {
      const [sub, next] = list(lines, i, options)
      current?.append(sub)
      i = next
      continue
    }
    if (!ITEM.test(line) || indent < base) {
      // 字下げした続きの行は、直前の項目に足す
      if (indent > base && current) {
        body.push(line.trim())
        i++
        continue
      }
      break
    }
    flush()
    current = el('li')
    node.append(current)
    body = [line.replace(ITEM, '')]
    i++
  }
  flush()
  return [node, i]
}

/** Markdown を要素の並び(DocumentFragment)にする */
export function renderMarkdown(text, options = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = document.createDocumentFragment()
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*```/.test(line)) {
      const body = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      i++
      out.append(el('pre', { className: 'code' }, [el('code', { text: body.join('\n') })]))
      continue
    }

    // 表。見出しの次の行が区切り(|---|---|)の時だけ表にする
    if (/^\s*\|/.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      out.append(el('div', { className: 'table-wrap' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, head.map(cell => el('th', {}, spans(cell, options))))]),
        el('tbody', {}, rows.map(row => el('tr', {}, row.map(cell => el('td', {}, spans(cell, options)))))),
      ])]))
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      out.append(el(`h${Math.min(heading[1].length, 4)}`, {}, spans(heading[2], options)))
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.append(el('hr'))
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const body = []
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''))
      out.append(el('blockquote', {}, [renderMarkdown(body.join('\n'), options)]))
      continue
    }

    if (ITEM.test(line)) {
      const [node, next] = list(lines, i, options)
      out.append(node)
      i = next
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    // 段落。次の空行か、別のかたまりが始まるまで。行の区切りはそのまま改行にする。
    // 1行目は必ず読む(表の区切りが続かない | の行などは、ここで段落として出す。読まずに戻ると、同じ行を繰り返して止まらない)
    const para = el('p')
    do {
      if (para.firstChild) para.append(el('br'))
      para.append(...spans(lines[i++], options))
    } while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !ITEM.test(lines[i]))
    out.append(para)
  }
  return out
}
