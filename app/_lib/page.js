// 道具のページに共通の、読む先の決め方と、ログインの案内。
// ページには id が gate / gate-message / sign-in / viewer / reauth / reauth-button の要素を置く
// (gate-links は見本と道具の一覧へのリンク、status は開いたものを読み上げる場所。あれば使う)。

import { $ } from './dom.js'
import { DriveSource, UrlSource, driveToken, forgetToken, goToSignIn } from './drive.js'
import { folderIdOf } from './path.js'

/** 案内を出す。links なら、見本と道具の一覧へのリンクも出す(ページに #gate-links がある時) */
export function showGate(message, { signIn = false, links = false } = {}) {
  $('gate').hidden = false
  $('viewer').hidden = true
  $('gate-message').textContent = message
  $('sign-in').hidden = !signIn
  if ($('gate-links')) $('gate-links').hidden = !links
}

export function showViewer() {
  $('gate').hidden = true
  $('viewer').hidden = false
}

/** 開いたものを、短く読み上げる(フォーカスは動かさない)。中身の全文は読み上げない */
export function announce(message) {
  if ($('status')) $('status').textContent = message
}

/**
 * URLの ?folder= から、読む先を作る。値は DriveのフォルダID(フォルダのURLでもよい)か、sample(見本)。
 * sample は、そのビューアの見本(<サイト>/sample/<sample>/)。読む場所はビューアが決め、URLからは変えられない
 * (DriveのフォルダIDは28文字ほどの英数字なので、sample と重ならない)。
 * 読めない時(ログインが要る、ログインへ移っている、など)は案内を出して null を返す。
 */
export function sourceFromLocation({ sample }) {
  const folder = new URLSearchParams(location.search).get('folder')

  if (folder === 'sample') return new UrlSource(new URL(`../sample/${sample}/`, location.href).href)

  if (folder) {
    const id = folderIdOf(folder)
    if (!id) {
      showGate('フォルダのIDの形が正しくありません。DriveのフォルダのURL(…/folders/ の後ろの英数字)を ?folder= に付けて開いてください。', { links: true })
      return null
    }
    $('sign-in').onclick = () => goToSignIn(location.href)
    const got = driveToken()
    if (got.error) showGate(got.error, { links: true })
    else if (got.ask) showGate(got.ask, { signIn: true })
    else if (got.wait) showGate('ログイン中...')
    if (!got.token) return null

    // 見ている途中でトークンが切れたら、押してもらってログインし直す。ページを移るので、この約束は果たされない。
    const renew = () => new Promise(() => {
      forgetToken()
      if ($('viewer').hidden) {
        showGate('ログインの期限が切れました。もう一度ログインしてください。', { signIn: true })
        return
      }
      $('reauth').hidden = false
      $('reauth-button').onclick = () => goToSignIn(location.href)
    })
    return new DriveSource(id, got.token, renew)
  }

  showGate('DriveのフォルダのURL(…/folders/ の後ろの英数字)を ?folder= に付けて開いてください。', { links: true })
  return null
}

/**
 * ビューアを始める。読む先を決め、「読み込み中...」を出して load(source) を呼ぶ。
 * load が失敗したら、そのわけを、見本と道具の一覧へのリンクと一緒に出す。
 */
export async function startViewer({ sample, load }) {
  const source = sourceFromLocation({ sample })
  if (!source) return
  showGate('読み込み中...')
  try {
    await load(source)
  }
  catch (error) {
    showGate(error.message, { links: true })
  }
}
