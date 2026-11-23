// 道具のページに共通の、読む先の決め方と、ログインの案内。
// ページには id が gate / gate-message / sign-in / viewer / reauth / reauth-message / reauth-button の要素を置く
// (gate-links は見本と道具の一覧へのリンク、status は開いたものを読み上げる場所。あれば使う)。

import { $ } from './dom.js'
// drive.js は版の印を付けて読み込む。ブラウザのキャッシュに前の版の drive.js が残っていても、この page.js がそれを引かないように。
// 印は drive.js の中身から作る。drive.js を変えたら、node scripts/check.mjs が出す印に直す。
import { DriveSource, UrlSource, driveToken, forgetToken, loadSignIn, rememberWrongAccount, signIn } from './drive.js?v=f3c6b1ba'
import { folderIdOf } from './path.js'

const SIGN_IN_LABEL = 'Googleでログインして開く'
const RENEW_LABEL = 'Googleでログインし直す'
const REOPEN_LABEL = 'ログインの窓をもう一度開く'
const WAITING = 'Googleのログインの窓で続けてください。'
const EXPIRED = 'ログインの期限が切れました。'

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
 * ボタンを押した時に、Googleのログインの窓を開く。窓を開いている間は waiting() を、終わったら done(結果) を呼ぶ。
 * 窓は、押した処理の中で待たずに開く(押した操作の無い時は、ブラウザに止められる)。
 */
function openSignIn({ waiting, done }) {
  const result = signIn()
  waiting()
  result.then(done)
}

/**
 * ページの中ほどの案内で、ボタンからログインしてもらう。ログインできたら「読み込み中...」にして、トークンで果たす。
 * Googleのログインの部品を読み終えてから、ボタンを出す。読み込めなければ、わけとリンクを出し、ボタンは出さない。
 */
function signInAtGate(message) {
  return new Promise((resolve) => {
    showGate('読み込み中...')
    const button = $('sign-in')
    const ask = (text) => {
      showGate(text, { signIn: true })
      button.textContent = SIGN_IN_LABEL
    }
    loadSignIn().then(() => {
      button.onclick = () => openSignIn({
        waiting: () => {
          showGate(WAITING, { signIn: true })
          button.textContent = REOPEN_LABEL
        },
        done: (got) => {
          if (!got.token) {
            ask(got.error)
            return
          }
          button.textContent = SIGN_IN_LABEL
          showGate('読み込み中...')
          resolve(got.token)
        },
      })
      ask(message)
    }, error => showGate(error.message, { links: true }))
  })
}

/**
 * 一覧を出した後にトークンが切れた時、上の帯でログインし直してもらう。ログインできたら帯を隠し、トークンで果たす。
 * 部品を読み終えるまでは、ボタンを押せない形で出す。読み込めなければ、わけを出し、ボタンは出さない。
 */
function signInAtBand() {
  return new Promise((resolve) => {
    const button = $('reauth-button')
    const show = (text, { label = RENEW_LABEL, disabled = false, hidden = false } = {}) => {
      // 前の版の HTML がキャッシュに残っていると、文言の場所(reauth-message)が無い。その時は文言を変えない。
      if ($('reauth-message')) $('reauth-message').textContent = text
      button.textContent = label
      button.disabled = disabled
      button.hidden = hidden
    }
    // ログインできたら、帯を出す前にいた所へフォーカスを戻す(押したボタンごと帯を隠すので)
    const back = document.activeElement
    $('reauth').hidden = false
    show(EXPIRED, { disabled: true })
    loadSignIn().then(() => {
      button.onclick = () => openSignIn({
        waiting: () => show(WAITING, { label: REOPEN_LABEL }),
        done: (got) => {
          if (!got.token) {
            show(got.error)
            return
          }
          $('reauth').hidden = true
          if (back?.isConnected) back.focus?.()
          resolve(got.token)
        },
      })
      show(EXPIRED)
      // 帯は一覧の後ろにあるので、押せるようになったら一度だけボタンへフォーカスを移す(読み上げでも気づけるように)
      button.focus?.()
    }, error => show(error.message, { hidden: true }))
  })
}

/**
 * URLの ?folder= から、読む先を作る。値は DriveのフォルダID(フォルダのURLでもよい)か、sample(見本)。
 * sample は、そのビューアの見本(<サイト>/sample/<sample>/)。読む場所はビューアが決め、URLからは変えられない
 * (DriveのフォルダIDは28文字ほどの英数字なので、sample と重ならない)。
 * Driveのフォルダでトークンが無ければ、ボタンからログインしてもらい、ログインできてから読む先を返す。
 * 読めない時(クライアントIDが無い、部品を読み込めない、など)は案内を出して null を返す(ログインを待つ間は返さない)。
 */
export async function sourceFromLocation({ sample }) {
  const folder = new URLSearchParams(location.search).get('folder')

  if (folder === 'sample') return new UrlSource(new URL(`../sample/${sample}/`, location.href).href)

  if (folder) {
    const id = folderIdOf(folder)
    if (!id) {
      showGate('フォルダのIDの形が正しくありません。DriveのフォルダのURL(…/folders/ の後ろの英数字)を ?folder= に付けて開いてください。', { links: true })
      return null
    }
    const got = driveToken()
    if (got.error) {
      showGate(got.error, { links: true })
      return null
    }
    let token = got.token
    // トークンがあっても、部品を前もって読み込んでおく(見ている途中で期限が切れた時に、すぐ押せるように)。読み込めなくても、今は何も出さない。
    if (token) loadSignIn().catch(() => {})
    else token = await signInAtGate(got.ask)

    // 見ている途中でトークンが切れたら、押してもらってログインし直す。ページは移らず、新しいトークンで続きを読む。
    const renew = () => {
      forgetToken()
      return $('viewer').hidden ? signInAtGate(`${EXPIRED}もう一度ログインしてください。`) : signInAtBand()
    }
    return new DriveSource(id, token, renew)
  }

  showGate('DriveのフォルダのURL(…/folders/ の後ろの英数字)を ?folder= に付けて開いてください。', { links: true })
  return null
}

/**
 * ビューアを始める。読む先を決め、「読み込み中...」を出して load(source) を呼ぶ。
 * load が失敗したら、そのわけを、見本と道具の一覧へのリンクと一緒に出す。
 * Driveのフォルダで見つからなかった時は、違うアカウントでログインしたのかもしれないので、次のログインでアカウントを選べるようにする。
 */
export async function startViewer({ sample, load }) {
  const source = await sourceFromLocation({ sample })
  if (!source) return
  showGate('読み込み中...')
  try {
    await load(source)
  }
  catch (error) {
    if (error.code === 'not-found' && source instanceof DriveSource) rememberWrongAccount()
    showGate(error.message, { links: true })
  }
}
