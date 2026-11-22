// 道具が共通で使う、画面に触れない小さな関数(パスの解決、リンク先の判定など)。
// ブラウザの外(node:test)でも確かめられるよう、document や window を使わない。

/** http: か https: のURLか(大文字小文字は区別しない)。外へのリンクにしてよいのはこれだけ */
export function isWebUrl(href) {
  return typeof href === 'string' && /^https?:\/\//i.test(href)
}

/**
 * 文書(from。作業フォルダからのパス)から見た相対のリンク先(href)を、作業フォルダからのパスにする。
 * ? と # から後ろは外し、%xx は戻す。次の時は null を返す(リンクにしない・読まない)。
 * - 作業フォルダの外へ出る(.. で上がりすぎる)
 * - 壊れた % がある(%zz など)、戻すと / や . / .. になる
 * - 相対のパスでない(https: などの書き方、/ から始まる、# だけ)
 * - ファイルを指さない(行き着く先が空)
 */
export function resolvePath(from, href) {
  if (typeof from !== 'string' || typeof href !== 'string') return null
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return null
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : ''
  const out = []
  for (const part of (dir + href.split(/[?#]/)[0]).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
      continue
    }
    let name
    try {
      name = decodeURIComponent(part)
    }
    catch {
      return null
    }
    if (name.includes('/') || name === '.' || name === '..') return null
    out.push(name)
  }
  return out.length ? out.join('/') : null
}

/**
 * ?folder= の値から、DriveのフォルダのIDを取り出す。
 * IDそのものか、DriveのフォルダのURL(https://drive.google.com/drive/folders/<ID>…)を受ける。どちらでもなければ null
 */
export function folderIdOf(value) {
  if (typeof value !== 'string') return null
  const id = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/i.exec(value)?.[1] ?? value
  return /^[\w-]+$/.test(id) ? id : null
}

/** 引き当ての表から引く。表が自分で持つキーだけを返す("constructor" などで、元から持つものを返さない) */
export function lookup(table, key) {
  return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined
}
