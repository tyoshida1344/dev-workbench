#!/usr/bin/env node
// 手元でサイトを、公開と同じ形で配る(app/ を直下に、sample/ を /sample/ に)。.github/workflows/pages.yml と同じ並べ方。
//   node scripts/serve.mjs [ポート]     既定は 8126。http://localhost:8126/ で開く
// 外のものは何も読み込まない(Node だけで動く)。待ち受けは 127.0.0.1 だけ。
// テストからは handle を読み込んで使う(直に走らせた時だけ待ち受ける)。

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 公開する時の場所 → リポジトリの中の場所。長いものから当てる */
const MOUNTS = [['/sample/', join(root, 'sample')], ['/', join(root, 'app')]]
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
}

/** URLのパスから、配るファイルを決める。外へ出るパスや、無いものは null */
function fileOf(pathname) {
  const [prefix, dir] = MOUNTS.find(([prefix]) => pathname.startsWith(prefix))
  const file = normalize(join(dir, decodeURIComponent(pathname.slice(prefix.length))))
  if (file !== dir && !file.startsWith(dir + sep)) return null
  return file
}

/** ファイルかフォルダの情報。無いものや、読めない名前(NUL の文字を含む、など)は null */
function statOf(file) {
  try {
    return statSync(file, { throwIfNoEntry: false }) ?? null
  }
  catch {
    return null
  }
}

/** 1つのリクエストに答える */
export function handle(request, response) {
  const { pathname, search } = new URL(request.url, 'http://localhost')
  // /sample のように、置き場の末尾の / が無いものは、付けた先へ移す(Pages と同じ)
  if (MOUNTS.some(([prefix]) => prefix !== '/' && pathname === prefix.slice(0, -1))) {
    response.writeHead(301, { Location: `${pathname}/${search}` }).end()
    return
  }
  let file
  try {
    file = fileOf(pathname)
  }
  catch {
    file = null
  }
  let stat = file && statOf(file)
  if (stat?.isDirectory()) {
    // フォルダは、末尾の / を付けてから index.html を配る(Pages と同じ。相対のパスがずれないように)
    if (!pathname.endsWith('/')) {
      response.writeHead(301, { Location: `${pathname}/${search}` }).end()
      return
    }
    file = join(file, 'index.html')
    stat = statOf(file)
  }
  if (!stat?.isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('見つかりません')
    return
  }
  response.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(response)
}

// 直に走らせた時だけ待ち受ける(Windows はドライブの文字の大小がそろわないことがあるので、区別せずに比べる)
const self = fileURLToPath(import.meta.url)
if (argv[1] && (process.platform === 'win32' ? resolve(argv[1]).toLowerCase() === self.toLowerCase() : resolve(argv[1]) === self)) {
  const port = Number(argv[2] ?? 8126)
  createServer(handle).listen(port, '127.0.0.1', () => {
    console.log(`http://localhost:${port}/ で配っています(app/ を直下に、sample/ を /sample/ に)`)
  })
}
