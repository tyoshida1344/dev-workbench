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
for (const file of files.filter(file => /\.(m?js)$/.test(file) && /[\\/](lib|design|evidence|auth)[\\/]/.test(file))) {
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
run('エビデンスの見本 evidence/sample', ['skills/evidence-pack/scripts/check-manifest.mjs', 'evidence/sample'])

// 6. 設計の見本の相対リンクと画像が、ファイルを指しているか
function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? markdownFiles(path) : name.endsWith('.md') ? [path] : []
  })
}
for (const file of markdownFiles(join(root, 'design', 'sample'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = m[1]
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue
    const target = resolve(dirname(file), decodeURIComponent(href.split(/[?#]/)[0]))
    if (!existsSync(target)) fail(rel(file), `リンク先がありません: ${href}`)
  }
}
for (const entry of JSON.parse(readFileSync(join(root, 'design', 'sample', 'evidence.json'), 'utf8'))) {
  const target = resolve(root, 'design', 'sample', entry.base, 'manifest.json')
  if (!existsSync(target)) fail('design/sample/evidence.json', `manifest.json がありません: ${entry.base}`)
}

// 7. テストケースのひな形から、正本が作れて検査を通るか
const work = mkdtempSync(join(tmpdir(), 'dev-workbench-check-'))
try {
  cpSync(join(root, 'skills', 'test-cases', 'templates', 'cases'), join(work, 'cases'), { recursive: true })
  run('テストケースのひな形 check-cases', ['skills/test-cases/scripts/check-cases.mjs', work])
  const out = join(work, 'evidence', 'check')
  run('テストケースのひな形 build-manifest', ['skills/test-cases/scripts/build-manifest.mjs', work, '--out', out])
  run('テストケースのひな形から作った正本 check-manifest', ['skills/evidence-pack/scripts/check-manifest.mjs', out])
}
finally {
  rmSync(work, { recursive: true, force: true })
}

// 8. スキルとサブエージェントの frontmatter
for (const file of files.filter(file => /[\\/]skills[\\/][^\\/]+[\\/]SKILL\.md$/.test(file) || /[\\/]agents[\\/][^\\/]+\.md$/.test(file))) {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))
  const name = head && /^name:\s*(\S+)/m.exec(head[1])?.[1]
  const expected = file.endsWith('SKILL.md') ? dirname(file).split(/[\\/]/).pop() : file.split(/[\\/]/).pop().replace(/\.md$/, '')
  if (!head) fail(rel(file), 'frontmatter がありません')
  else if (name !== expected) fail(rel(file), `name を ${expected} にします(今は ${name})`)
  else if (!/^description:/m.test(head[1])) fail(rel(file), 'description がありません')
}

console.log()
for (const line of failures) console.log(`エラー ${line}`)
console.log(failures.length ? `エラー ${failures.length} 件` : 'エラーはありません。')
process.exit(failures.length ? 1 : 0)
