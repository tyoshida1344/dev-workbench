// Markdown を画面の要素にする。設計の文書を読むための、最小の描画。
// 対応: 見出し・段落・箇条書き(入れ子も)・番号付き・表・コードブロック・引用・水平線と、行内の強調・斜体・コード・リンク・画像。
// 対応していない記法は、素の文として出す(取りこぼしても、読めなくならないことを優先する)。
//
// 文字はすべて textContent で入れる。HTMLは書いてあっても文字のまま出す(他人の文書を開かされても、ログインの情報を抜かれないように)。

import { el } from './dom.js'

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/
const ORDERED = /^\s*\d+[.)]/
const indentOf = line => line.match(/^\s*/)[0].length

/**
 * 行内の記法。先に現れたものから順に切り出す。
 * options.link(href) は開いてよいリンク先を返す(開かないなら null)。options.image(src) は画像のURLの約束を返す(出さないなら null)。
 */
const INLINE = [
  { re: /`([^`]+)`/, make: m => el('code', { text: m[1] }) },
  { re: /!\[([^\]]*)\]\(([^)\s]+)\)/, make: (m, options) => image(m[2], m[1], options) },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: (m, options) => link(m[2], m[1], options) },
  { re: /\*\*([^*]+)\*\*/, make: (m, options) => el('strong', {}, inline(m[1], options)) },
  { re: /(?<![*\w])\*([^*\n]+)\*(?![*\w])/, make: (m, options) => el('em', {}, inline(m[1], options)) },
]

function inline(text, options) {
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
  if (!resolved) return el('span', {}, inline(label, options))
  const external = /^https?:\/\//.test(resolved)
  return el('a', { attrs: { href: resolved, ...(external ? { target: '_blank', rel: 'noopener' } : {}) } }, inline(label, options))
}

function image(src, alt, options) {
  const img = el('img', { attrs: { alt, loading: 'lazy' } })
  const url = options.image?.(src)
  if (!url) return el('span', { text: `[画像: ${alt || src}]`, className: 'muted' })
  Promise.resolve(url).then((value) => { img.src = value }).catch(() => img.replaceWith(el('span', { text: `[画像を読めませんでした: ${src}]`, className: 'muted' })))
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
    if (current) current.prepend(...inline(body.join(' '), options))
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
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      out.append(el('div', { className: 'table-wrap' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, head.map(cell => el('th', {}, inline(cell, options))))]),
        el('tbody', {}, rows.map(row => el('tr', {}, row.map(cell => el('td', {}, inline(cell, options)))))),
      ])]))
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      out.append(el(`h${Math.min(heading[1].length, 4)}`, {}, inline(heading[2], options)))
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

    // 段落。次の空行か、別のかたまりが始まるまで。行の区切りはそのまま改行にする
    const para = el('p')
    let first = true
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|\s*```|>\s?|\s*\|)/.test(lines[i]) && !ITEM.test(lines[i])) {
      if (!first) para.append(el('br'))
      para.append(...inline(lines[i++], options))
      first = false
    }
    out.append(para)
  }
  return out
}
