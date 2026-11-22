#!/usr/bin/env node
// このリポジトリの検査。コミットやPRの前に走らせる(ビルドの手順は持たないので、これが検証の代わり)。
//   node scripts/check.mjs
// 外のものは何も読み込まない(Node だけで動く)。

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const fail = (where, message) => failures.push(`${where}: ${message}`)
const rel = path => relative(root, path).replaceAll('\\', '/')

/** 追跡しているファイル(.gitignore されたものや、手元だけのものを見ない) */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).map(file => join(root, file)).filter(file => existsSync(file))

function run(label, args, options = {}) {
  try {
    execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...options })
    console.log(`ok    ${label}`)
  }
  catch (error) {
    fail(label, `\n${(error.stdout ?? '') + (error.stderr ?? '')}`.trimEnd())
  }
}

// 1. JavaScript の構文
for (const file of files.filter(file => /\.(m?js)$/.test(file) && !file.includes('/vendor/'))) {
  run(`構文 ${rel(file)}`, ['--check', file])
}

// 2. JSON が読めるか
for (const file of files.filter(file => file.endsWith('.json'))) {
  try {
    JSON.parse(readFileSync(file, 'utf8'))
  }
  catch (error) {
    fail(rel(file), `JSON として読めません: ${error.message}`)
  }
}

// 3. 読み込んだ文字を HTML として入れていないか(CLAUDE.md の「読み込んだ文字は textContent で出す」)
for (const file of files.filter(file => /\.(m?js)$/.test(file) && /^app\//.test(rel(file)))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(line)) {
      fail(`${rel(file)}:${i + 1}`, 'HTML として入れています(textContent と要素の組み立てで出す)')
    }
  })
}

// 4. 外のスクリプトを読み込んでいないか(CLAUDE.md の「外部のスクリプトを読み込まない」)
for (const file of files.filter(file => file.endsWith('.html'))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/<(script|link)\b[^>]*(src|href)=["'](https?:)?\/\//i.test(line)) fail(`${rel(file)}:${i + 1}`, '外のスクリプト・スタイルを読み込んでいます')
  })
}

// 5. エビデンスの見本
run('エビデンスの見本 sample/evidence', ['scripts/check-manifest.mjs', 'sample/evidence'])

// 6. 設計の見本の相対リンクと画像が、ファイルを指しているか
function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? markdownFiles(path) : name.endsWith('.md') ? [path] : []
  })
}
for (const file of markdownFiles(join(root, 'sample', 'design'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = m[1]
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue
    const target = resolve(dirname(file), decodeURIComponent(href.split(/[?#]/)[0]))
    if (!existsSync(target)) fail(rel(file), `リンク先がありません: ${href}`)
  }
}
for (const entry of JSON.parse(readFileSync(join(root, 'sample', 'design', 'evidence.json'), 'utf8'))) {
  const target = resolve(root, 'sample', 'design', entry.base, 'manifest.json')
  if (!existsSync(target)) fail('sample/design/evidence.json', `manifest.json がありません: ${entry.base}`)
}

// 7. テストケースのひな形から、正本が作れて検査を通るか
const work = mkdtempSync(join(tmpdir(), 'dev-workbench-check-'))
try {
  cpSync(join(root, '.claude', 'skills', 'test-cases', 'templates', 'cases'), join(work, 'cases'), { recursive: true })
  run('テストケースのひな形 check-cases', ['.claude/skills/test-cases/scripts/check-cases.mjs', work])
  const out = join(work, 'evidence', 'check')
  run('テストケースのひな形 build-manifest', ['.claude/skills/test-cases/scripts/build-manifest.mjs', work, '--out', out])
  run('テストケースのひな形から作った正本 check-manifest', ['scripts/check-manifest.mjs', out])
}
finally {
  rmSync(work, { recursive: true, force: true })
}

// 8. スキルとサブエージェントの frontmatter
//    ユーザーが呼ぶスキルは .claude/skills/<スキル>/SKILL.md だけ(name はフォルダ名)。その中の入れ子の SKILL.md は、親が振り分けて読む手順なので frontmatter を持たない
//    (持つと、入れ子まで探す環境でスキルとして一覧に出てしまう)。サブエージェントは .claude/agents/<スキル>/ に置き、name はファイル名と同じにする
const names = new Map()
for (const file of files.filter(file => /[\\/]\.claude[\\/](skills[\\/].*[\\/]SKILL\.md|agents[\\/].+\.md)$/.test(file))) {
  const where = rel(file)
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))
  const name = head && /^name:\s*(\S+)/m.exec(head[1])?.[1]
  const isAgent = !file.endsWith('SKILL.md')
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
  else names.set(name, where)
}

// 9. 手順の中の相対リンクが、ファイルを指しているか
for (const file of files.filter(file => /[\\/]\.claude[\\/](skills|agents)[\\/].*\.md$/.test(file))) {
  // コードブロックと `…` の中は、書き方の例なので見ない
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]
    if (/^(?:[a-z]+:|#|\/|<)/i.test(href)) continue
    if (!existsSync(resolve(dirname(file), href.split('#')[0]))) fail(rel(file), `リンク先がありません: ${href}`)
  }
}

console.log()
for (const line of failures) console.log(`エラー ${line}`)
console.log(failures.length ? `エラー ${failures.length} 件` : 'エラーはありません。')
process.exit(failures.length ? 1 : 0)
