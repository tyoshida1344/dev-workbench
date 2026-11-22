// renderMarkdown を別のスレッドで走らせる。固まっても、テストの側から時間で止められるように(md.test.mjs が使う)。
// テストのファイルではないので、node --test から直に読まれた時は何もしない。

import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { html, installDom } from './dom.mjs'

if (!isMainThread) {
  installDom()
  const { renderMarkdown } = await import('../../app/_lib/md.js')
  parentPort.postMessage(html(renderMarkdown(workerData)))
}
