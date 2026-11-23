#!/usr/bin/env node
// このリポジトリの検査。コミットやPRの前に走らせる(ビルドの手順は持たないので、これが検証の代わり)。
//   node scripts/check.mjs
// 外のものは何も読み込まない(Node だけで動く)。最後に scripts/test/ のテスト(node --test)も走らせる。

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const fail = (where, message) => failures.push(`${where}: ${message}`)
const rel = path => relative(root, path).replaceAll('\\', '/')

/**
 * 追跡しているファイル(.gitignore されたものや、手元だけのものを見ない)。リポジトリの直下からの / 区切りのパス。
 * -z で取る(ASCII 以外の文字を含む名前も、引用符で囲まれずにそのまま返る)
 */
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(file => file && existsSync(join(root, file))).sort()
const tracked = new Set(files)
/** 追跡しているファイルを含むフォルダ(リンクがフォルダを指す時に使う) */
const folders = new Set(files.flatMap(file => file.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))))

/** ファイルの中身。同じファイルを何度も読まない */
const texts = new Map()
function text(file) {
  if (!texts.has(file)) texts.set(file, readFileSync(join(root, file), 'utf8'))
  return texts.get(file)
}

/** 文字の位置から、行の番号(1から) */
const lineAt = (body, index) => body.slice(0, index).split('\n').length

/** node を子のプロセスで走らせる。終わるのを待ち、{ ok, out } を返す(並べて走らせられるように) */
function node(args, input) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('error', error => done({ ok: false, out: error.message }))
    child.on('close', code => done({ ok: code === 0, out }))
    child.stdin.end(input ?? '')
  })
}

/** 子のプロセスの結果を、ok か エラーとして出す */
function report(label, { ok, out }) {
  if (ok) console.log(`ok    ${label}`)
  else fail(label, `\n${out}`.trimEnd())
}

// テストは時間がかかるので、最初に始めて、ほかの検査と並べて走らせる。
// Node 22 の --test はフォルダを渡しても中を探さないので、ファイルの名前の形(*.test.mjs)で渡す
const testRun = node(['--test', '--test-reporter=spec', 'scripts/test/*.test.mjs'])

const scripts = files.filter(file => /\.m?js$/.test(file))
const htmls = files.filter(file => file.endsWith('.html'))

// 1. JavaScript の構文
//    ページが <script src> で(type="module" を付けずに)読むものは、ふつうのスクリプトとして調べる(この中で調べる)。
//    それ以外の .js と .mjs は、ES モジュールとして調べる。Node の自動の見分けに頼らないよう、
//    中身を標準入力から --input-type=module で渡す。子のプロセスは並べて走らせる。
const classic = new Set()
for (const file of htmls) {
  for (const [tag] of text(file).matchAll(/<script\b[^>]*>/gi)) {
    const src = attributes(tag).get('src')
    if (src && !/\btype\s*=\s*["']?module\b/i.test(tag)) classic.add(posix.join(posix.dirname(file), src.split(/[?#]/)[0]))
  }
}
const syntax = Promise.all(scripts.map(async (file) => {
  if (classic.has(file) && !file.endsWith('.mjs')) {
    try {
      new Script(text(file), { filename: file })
      return [file, { ok: true }]
    }
    catch (error) {
      return [file, { ok: false, out: `${error.name}: ${error.message}\n${error.stack.split('\n').find(line => line.includes(file)) ?? ''}` }]
    }
  }
  const result = await node(['--input-type=module', '--check'], text(file))
  // 標準入力から渡したので、場所は [stdin] になる。ファイルの名前に置き換え、Node の中の呼び出し履歴は省く
  return [file, { ok: result.ok, out: result.out.replaceAll('[stdin]', file).split('\n').filter(line => !/^\s+at |^Node\.js v/.test(line)).join('\n') }]
}))

// 2. JSON が読めるか
for (const file of files.filter(file => file.endsWith('.json'))) {
  try {
    JSON.parse(text(file))
  }
  catch (error) {
    fail(file, `JSON として読めません: ${error.message}`)
  }
}

// 3. 読み込んだ文字を HTML として入れていないか(CLAUDE.md の「読み込んだ文字は textContent で出す」)
//    代入の形に限らず、語として探す(n['innerHTML']・Object.assign(n, { innerHTML }) なども拾う)
for (const file of scripts.filter(file => file.startsWith('app/'))) {
  const body = text(file)
  for (const m of body.matchAll(/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\s*\.\s*write(?:ln)?\b/g)) {
    fail(`${file}:${lineAt(body, m.index)}`, `HTML として入れています(textContent と要素の組み立てで出す): ${m[0]}`)
  }
}

// 4. 外のものを読み込んでいないか(CLAUDE.md の「外部のスクリプトを読み込まない」。例外は Googleのログインの部品だけ)
//    外 = http: / https: / // で始まるもの
const OUTSIDE = /^\s*(?:https?:|\/\/)/i

/** タグの属性。名前(小文字) → 値。引用符の無い値も読む */
function attributes(tag) {
  const out = new Map()
  for (const m of tag.replace(/^<[\w-]+/, '').matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

/** CSS の @import と url(…) が外を指していないか。コメントは改行を残して消す(行の番号をずらさない) */
function checkCss(file, body, offset = 0, all = body) {
  const css = body.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?["']?\s*((?:https?:|\/\/)[^"')\s;]*)|\burl\(\s*["']?\s*((?:https?:|\/\/)[^"')\s]*)/gi)) {
    fail(`${file}:${lineAt(all, offset + m.index)}`, `CSS で外のものを読み込んでいます: ${m[1] ?? m[2]}`)
  }
}

for (const file of scripts) {
  const body = text(file)
  // import … from '…' / import '…' / export … from '…' / import('…')
  for (const m of body.matchAll(/\b(?:import|export)\s*(?:[\w$*{},\s]*?\bfrom\s*)?["'`]((?:https?:|\/\/)[^"'`]*)|\bimport\s*\(\s*["'`]((?:https?:|\/\/)[^"'`]*)/gi)) {
    fail(`${file}:${lineAt(body, m.index)}`, `外のスクリプトを読み込んでいます: ${m[1] ?? m[2]}`)
  }
}

// JS で <script>・<iframe> を作る形(document.createElement と、共通の部品 el の1つ目)は、外のものを読み込める。
// Googleのログインの部品を読み込む drive.js のほかでは作らない。drive.js の中の外の URL は、ログインの部品と Drive の API だけにする
// (dom.js の el は、要素の名前を変数で受け取って作るだけなので、見ない。要素の名前を変数で渡す形、object・embed・link の要素は拾わないので、
//  外のものを読み込む作りを足す時は、この検査を広げる。部品は drive.js の script.src = SIGN_IN_SCRIPT の1か所だけで読み込む)
const SIGN_IN_LOADER = 'app/_lib/drive.js'
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client'
for (const file of scripts.filter(file => file.startsWith('app/'))) {
  const body = text(file)
  for (const m of body.matchAll(/\b(?:createElement|el)\s*\(\s*["'`](script|iframe)["'`]/gi)) {
    if (file !== SIGN_IN_LOADER) fail(`${file}:${lineAt(body, m.index)}`, `外のものを読み込める要素を作っています(Googleのログインの部品を読み込む ${SIGN_IN_LOADER} のほかでは作らない): ${m[1]}`)
  }
}
if (tracked.has(SIGN_IN_LOADER)) {
  const body = text(SIGN_IN_LOADER)
  for (const m of body.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]*)/g)) {
    if (m[1] !== SIGN_IN_SCRIPT && !m[1].startsWith('https://www.googleapis.com/')) {
      fail(`${SIGN_IN_LOADER}:${lineAt(body, m.index)}`, `Googleのログインの部品と Drive の API のほかの、外の URL があります: ${m[1]}`)
    }
  }

  // drive.js の版の印。page.js は drive.js を ?v=<印> で読み込み、ブラウザのキャッシュに残った前の版の drive.js を引かないようにする。
  // 印は drive.js の中身から作る(改行の違いは除く)。drive.js を変えたら、検査が出す印に読み込みを直す。
  // 印の無い読み込みは、前の版から移る人の片付けのために drive.js だけを読む道具の一覧(app/index.html)だけに許す
  // (同じページで印のあり・なしを両方読むと、別のモジュールが2つできる)。
  const mark = createHash('sha256').update(body.replace(/\r\n/g, '\n')).digest('hex').slice(0, 8)
  for (const file of files.filter(file => file.startsWith('app/') && /\.(?:m?js|html)$/.test(file) && file !== SIGN_IN_LOADER)) {
    const source = text(file)
    // 名前の前に区切り(/ か引用符)を求め、? や # の後ろは全体を拾って、?v=<印> と同じかを見る
    for (const m of source.matchAll(/(?:^|[/"'`])drive\.js([?#][^"'`]*)?["'`]/gm)) {
      const suffix = m[1] ?? ''
      if (file === 'app/index.html' && suffix === '') continue
      if (suffix !== `?v=${mark}`) fail(`${file}:${lineAt(source, m.index)}`, `drive.js は ?v=${mark} を付けて読み込みます(drive.js の中身から作った印。今は ${suffix || '印が無い'})`)
    }
  }
}

for (const file of htmls) {
  const body = text(file)
  // タグは改行をまたいでもよい。<a href> はページを移るだけなので見ない
  for (const m of body.matchAll(/<([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const name = m[1].toLowerCase()
    if (name === 'a') continue
    const attrs = attributes(m[0])
    for (const key of ['src', 'href', 'srcset', 'data', 'poster', 'action', 'formaction']) {
      const value = attrs.get(key)
      if (value === undefined) continue
      const urls = key === 'srcset' ? value.split(',').map(part => part.trim().split(/\s+/)[0]) : [value]
      if (urls.some(url => OUTSIDE.test(url))) fail(`${file}:${lineAt(body, m.index)}`, `外のものを読み込んでいます: <${name} ${key}="${value}">`)
    }
    const style = attrs.get('style')
    if (style) checkCss(file, style, m.index, body)
  }
  for (const m of body.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) checkCss(file, m[2], m.index + m[1].length, body)
}
for (const file of files.filter(file => file.endsWith('.css'))) checkCss(file, text(file))

// 5. エビデンスの見本
const sampleRun = node(['scripts/check-manifest.mjs', 'sample/evidence'])

// 6. リンクと画像が、ファイルを指しているか
//    スキル・サブエージェント・docs/・README・CLAUDE.md は、リポジトリの根からの場所を / で始めて書く(../ やそのファイルからの相対は使わない)
//    sample/ の見本は、ビューアが作業フォルダの中の相対として開くので、そのファイルからの相対で書く
//    コードブロックと `…` の中は、書き方の例なので見ない(ビューアもリンクにしない)
function checkLinks(file) {
  const fromRoot = !file.startsWith('sample/')
  const body = text(file).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]
    if (/^(?:[a-z][a-z\d+.-]*:|#|<)/i.test(href) || href.startsWith('//')) continue
    if (fromRoot && !href.startsWith('/')) { fail(file, `リンクはリポジトリの根からの場所を / で始めて書きます: ${href}`); continue }
    if (!fromRoot && href.startsWith('/')) { fail(file, `見本のリンクは、そのファイルからの相対で書きます: ${href}`); continue }
    let target
    try {
      const path = decodeURIComponent(href.split(/[?#]/)[0])
      target = posix.normalize(fromRoot ? path.slice(1) : posix.join(posix.dirname(file), path)).replace(/\/$/, '')
    }
    catch {
      fail(file, `リンクの % の書き方が壊れています: ${href}`)
      continue
    }
    if (!tracked.has(target) && !folders.has(target)) fail(file, `リンク先がありません: ${href}`)
  }
}
for (const file of files.filter(file => file.endsWith('.md') && (/^(?:sample|docs|agents|\.claude\/skills)\//.test(file) || file === 'README.md' || file === 'CLAUDE.md'))) {
  checkLinks(file)
}

// 7. スキルとサブエージェントの frontmatter
//    ユーザーが呼ぶスキルは .claude/skills/<スキル>/SKILL.md だけ(name はフォルダ名)。その中の入れ子の SKILL.md は、親が振り分けて読む手順なので frontmatter を持たない
//    (持つと、入れ子まで探す環境でスキルとして一覧に出てしまう)。サブエージェントはプラグインが読む agents/ の直下に置き(入れ子は読まれない)、name はファイル名と同じにする
const names = new Map()
for (const where of files.filter(file => /^(\.claude\/skills\/.*\/SKILL\.md|agents\/.+\.md)$/.test(file))) {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text(where))
  const name = head && /^name:\s*(\S+)/m.exec(head[1])?.[1]
  const isAgent = !where.endsWith('SKILL.md')
  const isEntry = /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(where)
  if (!isAgent && !isEntry) {
    if (head) fail(where, '入れ子の手順に frontmatter があります(スキルとして一覧に出ないよう、外す)')
    continue
  }
  const expected = isAgent ? where.split('/').pop().replace(/\.md$/, '') : where.split('/')[2]
  if (!head) fail(where, 'frontmatter がありません')
  else if (name !== expected) fail(where, `name を ${expected} にします(今は ${name})`)
  else if (!/^description:/m.test(head[1])) fail(where, 'description がありません')
  else if (names.has(name)) fail(where, `name が ${names.get(name)} と重なっています: ${name}`)
  else if (isEntry && !text(where).includes('${CLAUDE_SKILL_DIR}/../../..')) fail(where, 'dev-workbench の場所の行(${CLAUDE_SKILL_DIR}/../../..)がありません(docs/workspace.md の「dev-workbench の場所」)')
  else names.set(name, where)
}

// 8. テストケースのひな形から、正本が作れて検査を通るか(順に走らせる)
async function checkTemplates() {
  const work = mkdtempSync(join(tmpdir(), 'dev-workbench-check-'))
  const out = join(work, 'evidence', 'check')
  const results = []
  try {
    cpSync(join(root, '.claude', 'skills', 'test-cases', 'templates', 'cases'), join(work, 'cases'), { recursive: true })
    results.push(['テストケースのひな形 check-cases', await node(['.claude/skills/test-cases/scripts/check-cases.mjs', work])])
    results.push(['テストケースのひな形 build-manifest', await node(['.claude/skills/test-cases/scripts/build-manifest.mjs', work, '--out', out])])
    results.push(['テストケースのひな形から作った正本 check-manifest', await node(['scripts/check-manifest.mjs', out])])
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
  return results
}
const templateRun = checkTemplates()

// 並べて走らせたものの結果を、決まった順に出す
for (const [file, result] of await syntax) report(`構文 ${file}`, result)
report('エビデンスの見本 sample/evidence', await sampleRun)
for (const [label, result] of await templateRun) report(label, result)

// 9. テスト(scripts/test/)
const tests = await testRun
if (tests.ok) console.log('ok    テスト scripts/test/')
else {
  // 落ちたテストだけを出す(spec の出力は、最後に落ちたものをまとめて出す)
  const at = tests.out.indexOf('✖ failing tests:')
  fail('テスト scripts/test/', `\n${at < 0 ? tests.out : tests.out.slice(at)}`.trimEnd())
}

console.log()
for (const line of failures) console.log(`エラー ${line}`)
console.log(failures.length ? `エラー ${failures.length} 件` : 'エラーはありません。')
process.exit(failures.length ? 1 : 0)
