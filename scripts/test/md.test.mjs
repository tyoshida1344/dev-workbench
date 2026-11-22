// app/_lib/md.js(Markdown の描画)のテスト。DOM は dom.mjs の差し替えで用意する。

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'
import { html, installDom, settle } from './dom.mjs'

installDom()
const { renderMarkdown } = await import('../../app/_lib/md.js')

const render = (text, options) => html(renderMarkdown(text, options))
/** 描画して、画像など、あとで入るものを待ってから文字にする */
async function renderSettled(text, options) {
  const node = renderMarkdown(text, options)
  await settle()
  return html(node)
}

/** 別のスレッドで描画する。ms のうちに終わらなければ、固まったとして落とす */
function renderWithin(text, ms) {
  const worker = new Worker(new URL('./md-worker.mjs', import.meta.url), { workerData: text })
  return new Promise((done, reject) => {
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error(`${ms}ms のうちに終わりませんでした(固まっています): ${JSON.stringify(text)}`))
    }, ms)
    worker.once('message', (out) => {
      clearTimeout(timer)
      worker.terminate()
      done(out)
    })
    worker.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

test('見出しは h1〜h4 になる(5つ以上の # も h4)', () => {
  assert.equal(render('# 一\n## 二\n#### 四\n###### 六'), '<h1>一</h1><h2>二</h2><h4>四</h4><h4>六</h4>')
})

test('段落は空行で分かれ、行の区切りは改行になる', () => {
  assert.equal(render('一行目\n二行目\n\n次の段落'), '<p>一行目<br></br>二行目</p><p>次の段落</p>')
})

test('箇条書きは字下げで入れ子になる', () => {
  assert.equal(render('- 親\n  - 子\n  - 子2\n- 親2'), '<ul><li>親<ul><li>子</li><li>子2</li></ul></li><li>親2</li></ul>')
})

test('番号付きは ol になり、- と混ぜると別のリストになる', () => {
  assert.equal(render('1. 一\n2. 二'), '<ol><li>一</li><li>二</li></ol>')
  assert.equal(render('1. 一\n- 二'), '<ol><li>一</li></ol><ul><li>二</li></ul>')
})

test('表は見出しの次の行が区切りの時だけ表になる', () => {
  assert.equal(
    render('| a | b |\n|---|:-:|\n| 1 | **2** |'),
    '<div class="table-wrap"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div>',
  )
})

test('コードブロックの中は記法として読まない', () => {
  assert.equal(render('```js\n# 見出しではない\n**太字でもない**\n```'), '<pre class="code"><code># 見出しではない\n**太字でもない**</code></pre>')
})

test('引用と水平線', () => {
  assert.equal(render('> 引用の\n> **中**'), '<blockquote><p>引用の<br></br><strong>中</strong></p></blockquote>')
  assert.equal(render('---\n* * *'), '<hr></hr><hr></hr>')
})

test('行内の強調・斜体・コード', () => {
  assert.equal(render('**強** と *斜* と `**コード**`'), '<p><strong>強</strong> と <em>斜</em> と <code>**コード**</code></p>')
})

test('リンクと画像は、options が返した先だけを使う', async () => {
  const node = renderMarkdown('[文書](a.md) と ![図](b.png)', { link: href => `#file=${href}`, image: src => Promise.resolve(`blob:${src}`) })
  // 画像の URL は約束で渡るので、少し待つと入る
  await settle()
  const [a] = node.querySelectorAll('a')
  assert.equal(a.getAttribute('href'), '#file=a.md')
  assert.equal(a.textContent, '文書')
  const [img] = node.querySelectorAll('img')
  assert.equal(img.getAttribute('alt'), '図')
  assert.equal(img.src, 'blob:b.png')
})

test('外のリンクは新しいタブで開く', () => {
  assert.equal(render('[外](https://example.com/)', { link: href => href }), '<p><a href="https://example.com/" target="_blank" rel="noopener">外</a></p>')
})

test('options が無ければ、リンクも画像も出さない(文字は残す)', () => {
  assert.equal(render('[文書](a.md) ![図](b.png)'), '<p><span>文書</span> <span class="muted">[画像: 図]</span></p>')
})

test('javascript: などのリンクはリンクにならない(ビューアと同じく isWebUrl で選ぶ)', async () => {
  const { isWebUrl } = await import('../../app/_lib/path.js')
  const options = { link: href => (isWebUrl(href) ? href : null), image: src => (isWebUrl(src) ? src : null) }
  for (const href of ['javascript:alert%281%29', 'JavaScript:void0', 'data:text/html,x', 'vbscript:x']) {
    const out = await renderSettled(`[押す](${href}) ![図](${href})`, options)
    assert.doesNotMatch(out, /<a |<img /, href)
    assert.match(out, /押す/, href)
  }
  assert.match(render('[外](HTTPS://example.com/)', options), /<a href="HTTPS:\/\/example.com\/"/)
})

test('HTML は文字のまま出る', () => {
  const out = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n**<b>太</b>**')
  assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>&lt;img src=x onerror=alert(1)&gt;</p><p><strong>&lt;b&gt;太&lt;/b&gt;</strong></p>')
})

test('| で始まる、表でない行で固まらない', async () => {
  for (const text of ['a\n| 注意: x\nb', '| だけの行', '段落\n|\n続き', '- 項目\n| 注意']) {
    const out = await renderWithin(text, 2000)
    assert.match(out, /注意|だけ|続き|\|/, text)
  }
})
