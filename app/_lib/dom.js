// 道具が共通で使う、画面の要素を作る部品。
// 文字はすべて textContent で入れる(HTMLとしては解釈しない)。他人が作ったファイルを開かされても、ログインの情報を抜かれないようにするため。

/** id で要素を引く */
export const $ = id => document.getElementById(id)

/** 要素を作る */
export function el(tag, { text, className, attrs } = {}, children = []) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value)
  node.append(...children)
  return node
}

/** `…` で囲んだところを、画面の文言やコードとして等幅で出す */
export function inline(text) {
  return String(text).split('`').map((part, i) => (i % 2 ? el('code', { text: part }) : part)).filter(part => part !== '')
}

/**
 * 一覧の「今開いている行」を、前の行(previous)から新しい行(next)へ移す。全部の行は回さない。
 * value は aria-current の値。戻り値は新しい行(次に呼ぶ時の previous にする)
 */
export function setCurrent(previous, next, value = 'true') {
  if (previous && previous !== next) {
    previous.classList.remove('current')
    previous.removeAttribute('aria-current')
  }
  if (next) {
    next.classList.add('current')
    next.setAttribute('aria-current', value)
    next.scrollIntoView({ block: 'nearest' })
  }
  return next ?? null
}
