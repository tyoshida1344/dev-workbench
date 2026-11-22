#!/usr/bin/env node
// テストケースの下書き(作業フォルダの cases/)から、エビデンスビューアが読む manifest.json を作る。
//   node build-manifest.mjs <作業フォルダ> --out <作業フォルダ>/evidence/<YYYY-MM-DD>-<内容>
//       正本。重なり(duplicateOf)を除き、cases/order.json の順(無ければ種別の順)に並べた、未実施の項目
//   node build-manifest.mjs <作業フォルダ> --trail
//       証跡。下書きの全件を種別の順に並べ、重なりも打ち消し線で残したものを cases/manifest.json に書く
//   node build-manifest.mjs <作業フォルダ> --out <新しいフォルダ> --results-from <前のフォルダ> --redo <id>,<id>
//       再テスト。前のフォルダの結果を、やり直さない項目にだけ写す(前のフォルダは変えない)
// 形は ../reference/format.md。Node だけで動く(外のものを読み込まない)。

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA = 'dev-workbench/evidence@1'
// 下書きのファイル名(<kind>.json)と、証跡・正本に並べる順
export const KINDS = ['setup', 'unit', 'integration', 'regression', 'acceptance', 'cleanup']
export const TEST_KINDS = ['unit', 'integration', 'regression', 'acceptance']
// テストケースの中身。結果(result など)とは分けて比べる
export const CASE_FIELDS = ['title', 'priority', 'requirement', 'given', 'steps', 'expect', 'basis']
const RESULT_FIELDS = ['result', 'checks', 'note', 'video', 'image']
const PRIORITY_RANK = { low: 0, mid: 1, high: 2 }

export const list = value => [value ?? []].flat()

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch (error) {
    throw new Error(`${path} を読めません: ${error.message}`)
  }
}

/** 作業フォルダの cases/ から、plan.json・種別ごとの下書き・order.json を読む */
export function loadCases(workDir) {
  const dir = join(workDir, 'cases')
  if (!existsSync(dir)) throw new Error(`${dir} がありません`)
  const read = name => existsSync(join(dir, name)) ? readJson(join(dir, name)) : null
  const files = KINDS.flatMap(kind => {
    const data = read(`${kind}.json`)
    return data ? [{ kind, name: `${kind}.json`, data }] : []
  })
  return { dir, plan: read('plan.json') ?? {}, files, order: read('order.json') }
}

/** 統合した項目の id。order.json で決めていなければ、元の id を + でつなぐ */
export const mergedId = entry => entry.id ?? list(entry.merge).join('+')

/** 中身だけを取り出した文字列。前に作ったものと比べるのに使う(結果と note は比べない) */
export const caseView = item =>
  JSON.stringify([...CASE_FIELDS, 'duplicateOf'].filter(key => item[key] !== undefined).map(key => [key, item[key]]))

export const hasResults = manifest =>
  (manifest.sections ?? []).some(section => (section.items ?? []).some(item => item.result !== undefined || item.video || item.image))

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 下書きから manifest を組み立てる。ファイルは書かない */
export function buildManifest({ plan, files, order }, { trail = false } = {}) {
  const sections = files.flatMap(file => (file.data.sections ?? []).map(section => ({ ...section, kind: file.kind })))
  const cases = new Map()
  for (const section of sections) {
    for (const item of section.items ?? []) cases.set(item.id, { item, kind: section.kind })
  }
  // 重なり(duplicateOf)をたどって、行う項目の id にする
  const activeId = id => {
    const seen = new Set()
    let current = id
    while (cases.get(current)?.item.duplicateOf) {
      if (seen.has(current)) return null
      seen.add(current)
      current = cases.get(current).item.duplicateOf
    }
    return cases.has(current) ? current : null
  }

  const groups = trail ? null : order?.groups ?? null
  const finalIds = new Map() // 下書きの id → 正本の id
  const keyed = new Map() // key → { id, position }
  const positions = new Map() // order.json の項目 → 並びの位置
  for (const section of sections) {
    if (groups && TEST_KINDS.includes(section.kind)) continue
    for (const item of section.items ?? []) if (!item.duplicateOf) finalIds.set(item.id, item.id)
  }
  let position = 0
  for (const group of groups ?? []) {
    for (const entry of group.cases ?? []) {
      positions.set(entry, position)
      if (typeof entry === 'string') {
        if (!finalIds.has(entry)) finalIds.set(entry, entry)
      }
      else {
        const id = mergedId(entry)
        for (const origin of list(entry.merge)) if (!finalIds.has(origin)) finalIds.set(origin, id)
        if (entry.key) keyed.set(entry.key, { id, position })
      }
      position++
    }
  }

  // 本文の中の id を正本の id に書き換え、統合した項目の @key を、前にある項目の id に置き換える
  const idPattern = cases.size
    ? new RegExp(`(?<![\\w-])(${[...cases.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\w-])`, 'g')
    : null
  const rewriteText = (text, at) => {
    let result = text
    if (!trail && idPattern) result = result.replace(idPattern, id => finalIds.get(activeId(id) ?? id) ?? id)
    if (at !== undefined) {
      result = result.replace(/@([A-Za-z0-9-]+)/g, (match, key) => {
        const target = keyed.get(key)
        if (!target) return match
        if (target.position >= at) throw new Error(`@${key} は自分自身か後ろの項目を指しています。前にある項目だけを指せます`)
        return target.id
      })
    }
    return result
  }
  const rewrite = (value, at) => Array.isArray(value) ? value.map(entry => rewriteText(String(entry), at)) : rewriteText(String(value), at)

  const toItem = source => {
    const item = { id: source.id }
    for (const key of CASE_FIELDS) {
      if (source[key] === undefined || source[key] === null || source[key] === '') continue
      item[key] = ['priority', 'requirement', 'basis'].includes(key) ? source[key] : rewrite(source[key])
    }
    if (trail && source.duplicateOf) item.duplicateOf = source.duplicateOf
    if (source.noScreen) item.note = `画面で確かめられない理由: ${source.noScreen}`
    return item
  }

  const mergedItem = entry => {
    const at = positions.get(entry)
    const origins = list(entry.merge).map(id => {
      const found = cases.get(id)
      if (!found) throw new Error(`order.json の統合した項目の ${id} が下書きにありません`)
      if (found.item.duplicateOf) throw new Error(`order.json の統合した項目に、行わない項目 ${id} があります(duplicateOf: ${found.item.duplicateOf})`)
      return found
    })
    const item = { id: mergedId(entry), title: rewrite(entry.title, at) }
    item.priority = entry.priority ?? origins
      .map(found => found.item.priority)
      .filter(priority => priority in PRIORITY_RANK)
      .reduce((highest, priority) => PRIORITY_RANK[priority] > PRIORITY_RANK[highest] ? priority : highest, 'low')
    const requirements = [...new Set(origins.flatMap(found => list(found.item.requirement)))]
    if (requirements.length) item.requirement = requirements.length === 1 ? requirements[0] : requirements
    for (const key of ['given', 'steps', 'expect']) if (entry[key] !== undefined) item[key] = rewrite(entry[key], at)
    const bases = origins.filter(found => found.item.basis).map(found => `${found.item.id}: ${list(found.item.basis).join(' / ')}`)
    if (bases.length) item.basis = bases.join('\n')
    item.note = `まとめた項目: ${list(entry.merge).join(', ')}`
    return { item, kinds: origins.map(found => found.kind) }
  }

  const notes = [...list(plan.notes)]
  for (const excluded of list(plan.excluded)) notes.push(`確かめないこと: ${excluded.title}(${excluded.reason})`)
  const out = []
  const pushSection = section => {
    const items = (section.items ?? []).filter(item => trail || !item.duplicateOf).map(toItem)
    if (!items.length) return
    out.push({ title: section.title, kind: section.kind, items })
    for (const note of list(section.notes)) notes.push(`${section.title}: ${note}`)
  }
  const pushGroup = group => {
    const kinds = new Set()
    const items = (group.cases ?? []).map(entry => {
      if (typeof entry !== 'string') {
        const { item, kinds: originKinds } = mergedItem(entry)
        originKinds.forEach(kind => kinds.add(kind))
        return item
      }
      const found = cases.get(entry)
      if (!found) throw new Error(`order.json の ${entry} が下書きにありません`)
      if (found.item.duplicateOf) throw new Error(`order.json に、行わない項目 ${entry} があります(duplicateOf: ${found.item.duplicateOf})`)
      kinds.add(found.kind)
      return toItem(found.item)
    })
    const section = { title: `${String(group.id).toUpperCase()} ${group.title}${group.who ? `(${group.who})` : ''}` }
    if (kinds.size === 1) section.kind = [...kinds][0]
    section.items = items
    out.push(section)
    if (group.note) notes.push(`${section.title}: ${group.note}`)
  }

  if (!groups) {
    sections.forEach(pushSection)
  }
  else {
    sections.filter(section => section.kind === 'setup').forEach(pushSection)
    groups.filter(group => group.afterCleanup !== true).forEach(pushGroup)
    // 種別の節の説明は、行う項目が残っている節のものだけを出す
    for (const section of sections.filter(section => TEST_KINDS.includes(section.kind))) {
      if ((section.items ?? []).some(item => !item.duplicateOf)) for (const note of list(section.notes)) notes.push(`${section.title}: ${note}`)
    }
    sections.filter(section => section.kind === 'cleanup').forEach(pushSection)
    groups.filter(group => group.afterCleanup === true).forEach(pushGroup)
  }

  const manifest = { schema: SCHEMA, title: trail ? `${plan.title ?? 'テストケース'}(下書きの全件)` : plan.title ?? 'テストケース' }
  if (plan.source) manifest.source = plan.source
  if (notes.length) manifest.notes = notes
  if (list(plan.requirements).length) manifest.requirements = plan.requirements
  manifest.sections = out
  if (!trail && list(plan.attachments).length) manifest.attachments = plan.attachments.map(({ title, file }) => ({ title, file }))
  return manifest
}

/** 前のフォルダの結果を、やり直さない項目にだけ写す。前のフォルダは変えない */
function carryOver(manifest, fromDir, outDir, redo) {
  if (resolve(fromDir) === resolve(outDir)) throw new Error('--results-from には --out と別のフォルダを指定します(前の結果をそのまま残すため)')
  const old = readJson(join(fromDir, 'manifest.json'))
  const oldItems = new Map((old.sections ?? []).flatMap(section => section.items ?? []).map(item => [String(item.id), item]))
  const items = manifest.sections.flatMap(section => section.items)
  const ids = new Set(items.map(item => item.id))
  for (const id of redo) if (!ids.has(id)) throw new Error(`--redo の ${id} が、新しいテストケースにありません`)

  const carried = items.filter(item => !redo.has(item.id) && oldItems.get(item.id)?.result !== undefined)
  const changed = carried.filter(item => caseView(oldItems.get(item.id)) !== caseView(item)).map(item => item.id)
  if (changed.length) throw new Error(`中身が前回と変わった項目は、やり直しが要ります。--redo に足します: ${changed.join(', ')}`)

  const copy = file => {
    const source = join(fromDir, file)
    if (!existsSync(source)) throw new Error(`${source} がありません`)
    if (!existsSync(join(outDir, file))) copyFileSync(source, join(outDir, file))
  }
  for (const item of carried) {
    const was = oldItems.get(item.id)
    for (const key of RESULT_FIELDS) if (was[key] !== undefined) item[key] = was[key]
    for (const file of [item.video, item.image]) if (file) copy(file)
  }
  // 項目ごとの添付は、title を項目の id で始める決まり。やり直す項目のものは写さない
  const forRedo = title => [...redo].some(id => title === id || title.startsWith(`${id} `))
  for (const attachment of old.attachments ?? []) {
    if (forRedo(String(attachment.title ?? ''))) continue
    if ((manifest.attachments ?? []).some(entry => entry.file === attachment.file)) continue
    copy(attachment.file)
    ;(manifest.attachments ??= []).push(attachment)
  }
  for (const id of oldItems.keys()) if (!ids.has(id)) console.log(`注意  前回の ${id} は、新しいテストケースにありません(写していません)`)
  ;(manifest.notes ??= []).push(
    `${basename(fromDir)} の結果を ${carried.length} 件引き継いだ(確かめた環境はそのフォルダの notes を見る)。やり直す項目: ${[...redo].join(', ') || 'なし'}`,
  )
}

function countResults(manifest) {
  const summary = { ok: 0, partial: 0, ng: 0 }
  for (const section of manifest.sections) for (const item of section.items) if (item.result in summary) summary[item.result] += 1
  return summary
}

const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)

function main(argv) {
  const usage = '使い方: node build-manifest.mjs <作業フォルダ> (--trail | --out <フォルダ> [--results-from <前のフォルダ> --redo <id>,<id>] [--force])'
  const workDir = argv[0]
  const value = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null
  if (!workDir || workDir.startsWith('--') || (!argv.includes('--trail') && !value('--out'))) throw new Error(usage)
  const data = loadCases(resolve(workDir))

  if (argv.includes('--trail')) {
    const path = join(data.dir, 'manifest.json')
    writeJson(path, buildManifest(data, { trail: true }))
    console.log(`${path} を書きました(証跡)`)
  }

  const outDir = value('--out')
  if (!outDir) return
  const manifest = buildManifest(data)
  const target = join(outDir, 'manifest.json')
  if (existsSync(target) && !argv.includes('--force') && hasResults(readJson(target))) {
    throw new Error(`${target} には結果があるので上書きしません。やり直す時は、新しいフォルダに --results-from で作ります`)
  }
  mkdirSync(outDir, { recursive: true })
  for (const attachment of manifest.attachments ?? []) {
    const source = join(data.dir, attachment.file)
    if (!existsSync(source)) throw new Error(`plan.json の添付 ${source} がありません`)
    copyFileSync(source, join(outDir, attachment.file))
  }
  const from = value('--results-from')
  if (from) {
    const redo = new Set(String(value('--redo') ?? '').split(',').map(id => id.trim()).filter(Boolean))
    carryOver(manifest, resolve(from), resolve(outDir), redo)
  }
  if (hasResults(manifest)) manifest.summary = countResults(manifest)
  writeJson(target, manifest)
  const count = manifest.sections.reduce((sum, section) => sum + section.items.length, 0)
  console.log(`${target} を書きました(${manifest.sections.length} 節、${count} 項目)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  }
  catch (error) {
    console.error(`エラー ${error.message}`)
    process.exit(1)
  }
}
