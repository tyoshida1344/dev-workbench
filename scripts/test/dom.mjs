// テストで使う、最小の DOM の差し替え。app/_lib/ の部品が使う分だけを自前で用意する(外のパッケージは使わない)。
//   installDom()      globalThis.document と IntersectionObserver を差し替える
//   html(node)        要素を HTML の形の文字にする(確かめやすいように。文字は &lt; などにして出す)
// テストのファイルではないので、node --test から読まれても何もしない。

class FakeNode {
  constructor(tag) {
    this.tagName = tag
    this.childNodes = []
    this.parentNode = null
    this.attributes = new Map()
    this.className = ''
  }

  /** 子にする。文字はそのまま文字の子(textContent と同じく、HTML としては読まない) */
  static adopt(parent, children) {
    return children.map((child) => {
      const node = typeof child === 'string' ? new FakeText(child) : child
      if (node.tagName === '#fragment') {
        const inner = node.childNodes.splice(0)
        for (const item of inner) item.parentNode = parent
        return inner
      }
      node.parentNode?.removeChild(node)
      node.parentNode = parent
      return [node]
    }).flat()
  }

  append(...children) {
    this.childNodes.push(...FakeNode.adopt(this, children))
  }

  prepend(...children) {
    this.childNodes.unshift(...FakeNode.adopt(this, children))
  }

  removeChild(node) {
    this.childNodes = this.childNodes.filter(child => child !== node)
    node.parentNode = null
  }

  replaceWith(...nodes) {
    const parent = this.parentNode
    if (!parent) return
    const at = parent.childNodes.indexOf(this)
    parent.childNodes.splice(at, 1, ...FakeNode.adopt(parent, nodes))
    this.parentNode = null
  }

  replaceChildren(...children) {
    this.childNodes = []
    this.append(...children)
  }

  setAttribute(key, value) {
    this.attributes.set(key, String(value))
  }

  getAttribute(key) {
    return this.attributes.get(key) ?? null
  }

  get firstChild() {
    return this.childNodes[0] ?? null
  }

  addEventListener(type, listener) {
    this.listeners ??= []
    this.listeners.push([type, listener])
  }

  get children() {
    return this.childNodes.filter(child => !(child instanceof FakeText))
  }

  get textContent() {
    return this.childNodes.map(child => child.textContent).join('')
  }

  set textContent(value) {
    this.childNodes = [new FakeText(String(value))]
  }

  set src(value) {
    this.setAttribute('src', value)
  }

  get src() {
    return this.getAttribute('src') ?? ''
  }

  /** 子孫の要素から、タグの名前で探す */
  querySelectorAll(tag) {
    return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)])
  }
}

class FakeText {
  constructor(text) {
    this.text = text
    this.parentNode = null
  }

  get textContent() {
    return this.text
  }

  querySelectorAll() {
    return []
  }
}

/** 見張りの差し替え。見張り始めた要素は、すぐ(次の約束の番で)見えたことにする */
class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback
    this.watching = new Set()
  }

  observe(node) {
    this.watching.add(node)
    queueMicrotask(() => {
      if (this.watching.has(node)) this.callback([{ target: node, isIntersecting: true }], this)
    })
  }

  unobserve(node) {
    this.watching.delete(node)
  }

  disconnect() {
    this.watching.clear()
  }
}

export function installDom() {
  globalThis.document = {
    createElement: tag => new FakeNode(tag),
    createDocumentFragment: () => new FakeNode('#fragment'),
  }
  globalThis.IntersectionObserver = FakeIntersectionObserver
}

/** 約束の番を一巡りさせる(画像の読み込みなど、あとで入るものを待つ) */
export const settle = () => new Promise(done => setTimeout(done))

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 要素を HTML の形の文字にする。属性は書いた順に、class は先頭に出す */
export function html(node) {
  if (node instanceof FakeText) return escape(node.text)
  const inner = node.childNodes.map(html).join('')
  if (node.tagName === '#fragment') return inner
  const attrs = [
    ...(node.className ? [['class', node.className]] : []),
    ...node.attributes,
  ].map(([key, value]) => ` ${key}="${escape(value).replace(/"/g, '&quot;')}"`).join('')
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`
}
