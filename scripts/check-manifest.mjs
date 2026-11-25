#!/usr/bin/env node
// エビデンスのフォルダを確かめる。同期で Drive に上がる前に走らせて、綴り違いや数の食い違いを見つける。
//   node check-manifest.mjs <フォルダ>
// 形は dev-workbench の docs/evidence-manifest.md。外のものは何も読み込まない(Node だけで動く)。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { KINDS, SCENARIOS, SCENARIO_MESSAGE } from '../.claude/skills/test-cases/scripts/build-manifest.mjs'

const SCHEMA = 'dev-workbench/evidence@1'
const RESULTS = ['ok', 'partial', 'ng']
const VIDEO = /\.(webm|mp4|mov)$/i
const IMAGE = /\.(png|jpe?g|webp)$/i
const PRIORITIES = ['high', 'mid', 'low']

const errors = []
const warnings = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warnings.push(`${where}: ${message}`)

const dir = process.argv[2] ?? '.'

// 最後に出すURLは .claude/skills/config.json の site から作る(スキルがサイトのURLを読むのはあそこだけ)
let viewer = ''
try {
  const { site } = JSON.parse(readFileSync(new URL('../.claude/skills/config.json', import.meta.url), 'utf8'))
  // site の末尾に / が無いと、最後の部分が置き換わってしまうので補う
  if (site) viewer = new URL('evidence/', site.endsWith('/') ? site : `${site}/`).href
}
catch {}

let names
try {
  names = readdirSync(dir)
}
catch {
  console.error(`フォルダが読めません: ${dir}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
}
catch (error) {
  console.error(`manifest.json が読めません: ${error.message}`)
  process.exit(1)
}

/** null でも配列でもないオブジェクト */
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
if (!isObject(manifest)) {
  console.log(`エラー manifest.json: オブジェクト({ … })にします(今は ${JSON.stringify(manifest)})`)
  console.log('エラー 1 件。直してから渡します。')
  process.exit(1)
}

// 参照されたファイルを、フォルダの中から大文字小文字まで同じ名前で探す。
// Windows と Drive では違いを無視するが、Pages から読む時は区別されるため。
const used = new Set()
function checkFile(where, file, pattern, kind) {
  if (typeof file !== 'string' || !file) return fail(where, 'ファイル名が文字列ではありません')
  if (file !== basename(file)) return fail(where, `ファイル名だけを書きます(パスは書きません): ${file}`)
  if (pattern && !pattern.test(file)) fail(where, `${kind}として開けない拡張子です: ${file}`)
  used.add(file)
  if (names.includes(file)) {
    if (statSync(join(dir, file)).size === 0) fail(where, `中身が空です: ${file}`)
    return
  }
  const similar = names.find(name => name.toLowerCase() === file.toLowerCase())
  fail(where, similar ? `大文字小文字が違います: ${file} (フォルダには ${similar})` : `フォルダにありません: ${file}`)
}

if (manifest.schema !== SCHEMA) fail('schema', `${SCHEMA} にします(今は ${JSON.stringify(manifest.schema)})`)
if (!manifest.title) fail('title', '見出しがありません')
if (manifest.recordedAt && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.recordedAt)) fail('recordedAt', 'YYYY-MM-DD にします')
if (manifest.notes && !Array.isArray(manifest.notes)) fail('notes', '配列にします')
if (manifest.source !== undefined) {
  if (!isObject(manifest.source)) fail('source', 'オブジェクトにします')
  // ビューアは http / https の時だけリンクにする
  else if (manifest.source.url !== undefined && !/^https?:\/\//i.test(String(manifest.source.url))) fail('source.url', `http: か https: のURLにします(今は ${JSON.stringify(manifest.source.url)})`)
}

const counts = { ok: 0, partial: 0, ng: 0 }
/** 未実施(result の無い)項目の数。テストケースを書いた時点では、すべての項目が未実施になる */
let pending = 0
const ids = new Map()
const duplicates = []
let sections = manifest.sections ?? []
if (!Array.isArray(sections)) {
  fail('sections', '配列にします')
  sections = []
}
else if (!sections.length) fail('sections', '節がありません')

const requirementIds = new Set()
if (manifest.requirements !== undefined) {
  if (!Array.isArray(manifest.requirements)) fail('requirements', '配列にします')
  else manifest.requirements.forEach((requirement, r) => {
    if (!requirement?.id || !requirement?.text) fail(`requirements[${r}]`, 'id と text を書きます')
    else requirementIds.add(String(requirement.id))
  })
}

/** 文字列か、文字列の配列 */
const isTextList = value => typeof value === 'string' || (Array.isArray(value) && value.every(line => typeof line === 'string'))

sections.forEach((section, s) => {
  const at = `sections[${s}]`
  if (!isObject(section)) return fail(at, '節がオブジェクトではありません')
  if (!section.title) fail(at, '節の名前がありません')
  if (section.kind !== undefined && !KINDS.includes(section.kind)) fail(at, `kind は ${KINDS.join(' / ')} のどれかにします(今は ${JSON.stringify(section.kind)})`)
  const items = section.items ?? []
  if (!Array.isArray(items)) return fail(at, 'items は配列にします')
  if (!items.length) warn(at, `項目がありません: ${section.title ?? ''}`)
  if (section.flow !== undefined && section.flow !== true) fail(at, 'flow は true だけを書きます(流れでない節には書きません)')
  else if (section.flow === true && items.length === 1) warn(at, `流れの項目が1件だけです: ${section.title ?? ''}`)
  items.forEach((item, i) => {
    if (!isObject(item)) return fail(`${at}.items[${i}]`, '項目がオブジェクトではありません')
    const where = `${at}.items[${i}]${item.id ? ` (#${item.id})` : ''}`
    if (!item.title) fail(where, '受入確認の文言がありません')
    if (item.result === undefined) {
      if (!item.duplicateOf) pending += 1
    }
    else if (!RESULTS.includes(item.result)) fail(where, `result は ${RESULTS.join(' / ')} のどれかにします(今は ${JSON.stringify(item.result)})`)
    else if (!item.duplicateOf) counts[item.result] += 1
    for (const key of ['steps', 'expect']) {
      if (item[key] !== undefined && !isTextList(item[key])) fail(where, `${key} は文字列か、文字列の配列にします`)
    }
    for (const key of ['given', 'basis', 'note']) {
      if (item[key] !== undefined && typeof item[key] !== 'string') fail(where, `${key} は文字列にします`)
    }
    if (item.priority !== undefined && !PRIORITIES.includes(item.priority)) fail(where, `priority は ${PRIORITIES.join(' / ')} のどれかにします`)
    if (item.scenario !== undefined && !SCENARIOS.includes(item.scenario)) fail(where, SCENARIO_MESSAGE)
    if (item.review !== undefined && item.review !== true) fail(where, 'review は true だけを書きます(付けない時は書きません)')
    else if (item.review === true && item.duplicateOf) warn(where, '行わない項目に review があります(★ は出ません)')
    for (const id of [].concat(item.requirement ?? [])) {
      if (!requirementIds.has(String(id))) fail(where, `requirements に無い要件です: ${id}`)
    }
    if (item.duplicateOf !== undefined) duplicates.push({ where, to: String(item.duplicateOf) })
    if (item.id !== undefined) {
      const id = String(item.id)
      if (ids.has(id)) fail(where, `id が重なっています: ${id} (${ids.get(id)} と同じ)`)
      else ids.set(id, where)
    }
    if (item.checks !== undefined) {
      if (!Array.isArray(item.checks)) fail(where, 'checks は配列にします')
      else item.checks.forEach((line, c) => {
        if (typeof line !== 'string') fail(`${where}.checks[${c}]`, '文字列にします')
        else if (!/^[○✓△!×✕]\s*\S/.test(line)) warn(`${where}.checks[${c}]`, `行頭に ○ / △ / × を付けると印が出ます: ${line}`)
      })
    }
    if (item.video && item.image) fail(where, 'video と image はどちらか一方にします(両方あると動画だけが出ます)')
    if (item.video) checkFile(where, item.video, VIDEO, '動画')
    else if (item.image) checkFile(where, item.image, IMAGE, '画像')
    else if (item.result !== undefined && !item.duplicateOf) warn(where, '結果はあるのに、動画も画像もありません')
    if (item.result === undefined && (item.video || item.image)) warn(where, '動画か画像はあるのに、結果(result)がありません。書き忘れていないか確かめます')
  })
})

const attachments = manifest.attachments ?? []
if (!Array.isArray(attachments)) fail('attachments', '配列にします')
else attachments.forEach((attachment, a) => {
  const where = `attachments[${a}]`
  if (!isObject(attachment)) return fail(where, '添付がオブジェクトではありません')
  if (!attachment.title) fail(where, 'title がありません')
  checkFile(where, attachment.file, null, '添付')
})

for (const { where, to } of duplicates) {
  if (!ids.has(to)) fail(where, `duplicateOf の先の項目がありません: ${to}`)
}

if (manifest.summary !== undefined && manifest.summary !== null && !isObject(manifest.summary)) fail('summary', 'オブジェクトにします')
else if (manifest.summary) {
  if (manifest.summary.pending !== undefined) fail('summary', '未実施の数は書きません(ビューアが数えます)')
  for (const result of RESULTS) {
    const written = manifest.summary[result] ?? 0
    if (written !== counts[result]) fail('summary', `${result} は ${counts[result]} 件ですが ${written} と書いてあります`)
  }
}
else if (counts.ok + counts.partial + counts.ng) warn('summary', '件数がありません')

for (const name of names) {
  if (name === 'manifest.json' || name === 'README.md' || used.has(name)) continue
  if (statSync(join(dir, name)).isDirectory()) warn(name, 'サブフォルダは読まれません(フォルダは平らにします)')
  else warn(name, 'manifest.json から参照されていません')
}

const total = counts.ok + counts.partial + counts.ng
for (const line of warnings) console.log(`注意  ${line}`)
for (const line of errors) console.log(`エラー ${line}`)
console.log(`\n${dir}: 項目 ${total + pending} 件(✓${counts.ok} / !${counts.partial} / ✕${counts.ng}${pending ? ` / 未実施 ${pending}` : ''})、添付 ${attachments.length} 件`)
console.log(errors.length ? `エラー ${errors.length} 件。直してから渡します。` : 'エラーはありません。')
if (!errors.length && viewer) console.log(`Drive に同期したら: ${viewer}?folder=<フォルダID>`)
process.exit(errors.length ? 1 : 0)
