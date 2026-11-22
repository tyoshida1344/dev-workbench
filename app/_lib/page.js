// 道具のページに共通の、読む先の決め方と、ログインの案内。
// ページには id が gate / gate-message / sign-in / viewer / reauth / reauth-button の要素を置く(gate-links はあれば使う)。

import { DriveSource, UrlSource, driveToken, forgetToken, goToSignIn, isFolderId } from './drive.js'

const $ = id => document.getElementById(id)

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

/**
 * URLの ?folder=<DriveのフォルダID> か ?base=<URL> から、読む先を作る。
 * 読めない時(ログインが要る、ログインへ移っている、など)は案内を出して null を返す。
 */
export function sourceFromLocation() {
  const params = new URLSearchParams(location.search)
  const folder = params.get('folder')
  const base = params.get('base')

  if (folder) {
    if (!isFolderId(folder)) {
      showGate('フォルダのIDの形が正しくありません。')
      return null
    }
    $('sign-in').onclick = () => goToSignIn(location.href)
    const got = driveToken()
    if (got.error) showGate(got.error)
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
    return new DriveSource(folder, got.token, renew)
  }

  if (base) {
    // 読む先は同じサイトの中だけ(見本と、手元で scripts/serve.mjs が配るもの)。
    // ほかのサイトを読めると、そのサイトの文書をこのサイトの画面として見せられてしまう。
    let url
    try {
      url = new URL(base, location.href)
    }
    catch {
      url = null
    }
    if (!url || url.origin !== location.origin) {
      showGate('?base= には、このサイトの中の場所だけを指定できます。', { links: true })
      return null
    }
    return new UrlSource(url.href)
  }

  showGate('URLに ?folder=<DriveのフォルダID> を付けて開いてください。', { links: true })
  return null
}
