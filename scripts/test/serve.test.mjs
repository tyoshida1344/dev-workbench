// scripts/serve.mjs のテスト。空いているポートで待ち受け、パスをそのまま(Node に直させずに)送って確かめる。

import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { after, before, test } from 'node:test'

const { handle } = await import('../serve.mjs')

let server
let port
before(async () => {
  server = createServer(handle)
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  port = server.address().port
})
after(() => server.close())

/** パスを書いたまま送る。{ status, location, body } を返す */
function get(path) {
  return new Promise((done, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => done({ status: response.statusCode, location: response.headers.location, type: response.headers['content-type'], body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('app/ を直下に、sample/ を /sample/ に配る', async () => {
  const top = await get('/')
  assert.equal(top.status, 200)
  assert.match(top.type, /^text\/html/)
  assert.equal((await get('/_lib/md.js')).status, 200)
  assert.equal((await get('/sample/evidence/manifest.json')).status, 200)
})

test('/sample(末尾の / が無い)は /sample/ へ 301 で移す', async () => {
  const res = await get('/sample')
  assert.equal(res.status, 301)
  assert.equal(res.location, '/sample/')
  const withQuery = await get('/sample?x=1')
  assert.equal(withQuery.status, 301)
  assert.equal(withQuery.location, '/sample/?x=1')
})

test('フォルダは末尾に / を付けた先へ 301 で移し、/ があれば index.html を配る', async () => {
  const res = await get('/evidence')
  assert.equal(res.status, 301)
  assert.equal(res.location, '/evidence/')
  assert.equal((await get('/evidence/')).status, 200)
  assert.equal((await get('/sample/evidence')).location, '/sample/evidence/')
})

test('無いものは 404', async () => {
  assert.equal((await get('/no-such-file.html')).status, 404)
  assert.equal((await get('/sample/no-such-file.md')).status, 404)
})

test('app/・sample/ の外は返さない(.. や % で書いた区切りを使っても)', async () => {
  const paths = [
    '/../README.md',
    '/../scripts/serve.mjs',
    '/%2e%2e/README.md',
    '/%2E%2E/scripts/serve.mjs',
    '/..%2fREADME.md',
    '/..%2FREADME.md',
    '/..%5cREADME.md',
    '/..%5CREADME.md',
    '/%2e%2e%5cscripts%5cserve.mjs',
    '/..\\README.md',
    '/sample/../README.md',
    '/sample/%2e%2e/README.md',
    '/sample/..%2f..%2fREADME.md',
    '/sample/..%5c..%5cREADME.md',
    '/sample/../app/index.html',
    '/sample%2f..%2f..%2fREADME.md',
    '/%252e%252e/README.md',
    '/.git/config',
    '/%2e%2e/.git/config',
    '/%00',
    '/..%00/README.md',
    '/%E0%A4%A',
  ]
  for (const path of paths) {
    const res = await get(path)
    // 外のファイルの中身が返っていないこと(301 で移す時も、移す先が外でないこと)
    assert.ok(res.status === 404 || res.status === 400 || (res.status === 301 && !/\.\.|%2e/i.test(res.location)), `${path} → ${res.status} ${res.location ?? ''}`)
    assert.doesNotMatch(res.body, /dev-workbench|\[core\]|import /, path)
  }
})
