#!/usr/bin/env node
// テストケースの下書き(作業フォルダの cases/)を確かめる。書き方の決まりのうち、機械で判定できるものはここで止める。
//   node check-cases.mjs <作業フォルダ>
//       下書きの全部と order.json
//   node check-cases.mjs <作業フォルダ> --file <cases/unit.json のパス>
//       その1ファイルだけ(種別ごとに並行して書いている間。ほかの担当の書きかけに巻き込まれないため)
//   node check-cases.mjs <作業フォルダ> --manifest <evidence の下のフォルダ>
//       あわせて、そのフォルダの manifest.json が今の下書きから作ったものと合っているか
// 形は ../reference/format.md。manifest.json の形そのもの(ファイル名・summary の数)は <dev-workbench>/scripts/check-manifest.mjs が見る。

import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { KINDS, SCENARIOS, SCENARIO_MESSAGE, TEST_KINDS, buildManifest, caseView, list, loadCases, mergedId, readJson } from './build-manifest.mjs'

const PRIORITIES = ['high', 'mid', 'low']
// 上位のテストほど大きい。duplicateOf は同じか上の階層を指す
const TIER = { setup: 0, cleanup: 0, unit: 1, integration: 2, regression: 3, acceptance: 3 }
// コードの言葉: ソースのファイル名・関数の呼び出し ()・snake_case の名前・HTTP のステータス
const CODE_WORDS = /[\w./-]+\.(?:py|ts|tsx|js|jsx|mjs|cjs|vue|svelte|rb|java|kt|go|rs|cs|swift|sql|php)\b|\b\w+\(\)|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\bHTTP\s?\d{3}\b/
// HTML は書けない(ビューアは文字としてそのまま出す)
const HTML_TAG = /<\/?(?:a|b|i|u|s|em|strong|br|hr|p|div|span|code|pre|ul|ol|li|table|thead|tbody|tr|td|th|img|h[1-6]|small|mark|kbd)\b[^<>]*>/i
// コマンドは、手順の1つの要素に `…` だけで置く(文の中の `…` は画面の値などの引用)
const COMMAND_STEP = /^`[^`\n]+`$/
const ID_FORMAT = /^[A-Za-z0-9-]+$/
const UNKNOWN = '【要確認】'

const errors = []
const fail = (where, message) => errors.push(`${where}: ${message}`)

const argv = process.argv.slice(2)
const value = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null
const workDir = argv[0]
if (!workDir || workDir.startsWith('--')) {
  console.error('使い方: node check-cases.mjs <作業フォルダ> [--file <cases/xxx.json>] [--manifest <evidence の下のフォルダ>]')
  process.exit(1)
}

let data
try {
  data = loadCases(resolve(workDir))
}
catch (error) {
  console.error(`エラー ${error.message}`)
  process.exit(1)
}
const { plan, files, order } = data

const onlyName = value('--file') ? basename(value('--file')) : null
// --file は自分のファイルだけを見る(並行して書いている間に、設計の表の誤りに巻き込まれないため)
if (!onlyName) for (const message of data.acceptanceErrors) fail('設計', message)
for (const warning of data.warnings) console.log(`注意  ${warning}`)
if (onlyName && !files.some(file => file.name === onlyName)) {
  fail(onlyName, `cases/ にありません(書けるのは ${KINDS.map(kind => `${kind}.json`).join(' / ')})`)
}

// 文字列か、空でない文字列の配列か
const isText = value => (typeof value === 'string' && value.trim() !== '') || (Array.isArray(value) && value.length > 0 && value.every(entry => typeof entry === 'string' && entry.trim() !== ''))
// 見る人が読む欄の書き方。`コマンド` と「画面の文言」は引用なので外して見る
function checkWording(where, fields, fromDesign = false) {
  for (const [key, value] of fields) {
    if (value === undefined) continue
    const text = list(value).join('\n')
    const plain = text.replace(/`[^`\n]+`/g, '').replace(/「[^」\n]*」/g, '')
    const code = plain.match(CODE_WORDS)
    if (code) fail(where, fromDesign
      ? `${key} にコードの言葉「${code[0]}」があります。acceptance.md の表を、画面・業務の言葉に直します`
      : `${key} にコードの言葉「${code[0]}」があります。画面・業務の言葉に直し、コードの根拠は basis に書きます`)
    const html = plain.match(HTML_TAG)
    if (html) fail(where, `${key} に HTML「${html[0]}」があります。HTML は書けないので、文に直します`)
  }
}

// --- plan.json
const requirementIds = []
for (const [index, requirement] of list(plan.requirements).entries()) {
  if (!requirement?.id || !requirement?.text) fail(`plan.json requirements[${index}]`, 'id と text が要ります')
  else if (requirementIds.includes(requirement.id)) fail(`plan.json requirements[${index}]`, `id ${requirement.id} が重なっています`)
  else requirementIds.push(requirement.id)
}
if (plan.notes !== undefined && !Array.isArray(plan.notes)) fail('plan.json', 'notes は配列にします')
if (!onlyName && !plan.title) fail('plan.json', 'title がありません(ビューアの見出しになります)')

// --- 種別ごとの下書き
const sections = []
for (const file of files) {
  if (!Array.isArray(file.data.sections)) {
    fail(file.name, 'sections の配列にします({ "sections": [...] })')
    continue
  }
  for (const section of file.data.sections) sections.push({ ...section, file: file.name, declaredKind: section.kind, kind: file.kind, fromDesign: file.fromDesign === true })
}
const own = onlyName ? sections.filter(section => section.file === onlyName) : sections
if (onlyName && files.some(file => file.name === onlyName) && !own.length) fail(onlyName, '節がありません')

const covered = new Set()
for (const section of own) {
  const at = `${section.file} ${section.title ?? section.id ?? ''}`
  if (typeof section.id !== 'string' || !ID_FORMAT.test(section.id)) fail(at, '節の id は英数字とハイフンにします(例: tc02、setup)')
  if (!section.title) fail(at, '節の title がありません')
  if (section.declaredKind !== section.kind) fail(at, `kind は "${section.kind}" にします(ファイル名と同じ。今は ${JSON.stringify(section.declaredKind)})`)
  if (section.notes !== undefined && !Array.isArray(section.notes)) fail(at, 'notes は配列にします')
  checkWording(at, [['notes', section.notes]])
  if (!Array.isArray(section.items) || !section.items.length) {
    fail(at, '項目がありません')
    continue
  }
  const test = TEST_KINDS.includes(section.kind)
  for (const item of section.items) {
    const where = `${section.file} ${item.id ?? '(id なし)'}`
    if (!section.fromDesign && (typeof item.id !== 'string' || !item.id.startsWith(`${section.id}-`))) fail(where, `id は節の id で始めます(${section.id}-01 など)`)
    if (!item.title) fail(where, 'title がありません(何が正しいと言えれば合格かを1文で)')
    if (!isText(item.steps)) fail(where, 'steps がありません(文字列か文字列の配列)')
    for (const key of ['result', 'checks', 'video', 'image']) {
      if (item[key] !== undefined) fail(where, `下書きに ${key} は書きません(結果は正本の manifest.json に書きます)`)
    }
    if (item.review !== undefined) fail(where, 'review は下書きに書きません(受け入れの項目に、組み立てが付けます)')
    if (item.scenario !== undefined && !SCENARIOS.includes(item.scenario)) fail(where, SCENARIO_MESSAGE)
    for (const key of ['url', 'text', 'purpose']) {
      if (item[key] !== undefined) fail(where, `${key} は使いません(${key === 'url' ? 'given か steps に書きます' : key === 'text' ? 'steps に書きます' : 'title に書きます'})`)
    }
    if (item.duplicateOf) continue

    checkWording(where, [['title', item.title], ['given', item.given], ['steps', item.steps], ['expect', item.expect]], section.fromDesign)
    if (JSON.stringify(item).includes(UNKNOWN)) fail(where, `${UNKNOWN} が残っています。ユーザーに聞いて埋めます(推測で埋めない)`)
    if (item.given !== undefined && typeof item.given !== 'string') fail(where, 'given は文字列にします(2行まで)')
    if (item.expect !== undefined && !isText(item.expect)) fail(where, 'expect は文字列か文字列の配列にします')
    if (item.priority !== undefined && !PRIORITIES.includes(item.priority)) fail(where, `priority は ${PRIORITIES.join(' / ')} のどれかにします`)
    // 設計の受け入れ基準から作った項目は、期待する結果を title に持つ(acceptance.md の形は readAcceptance が見る)
    if (test && !section.fromDesign) {
      if (!item.expect) fail(where, 'expect がありません')
      if (!item.priority) fail(where, 'priority がありません')
    }
    if (section.kind === 'unit' && !item.basis) fail(where, '単体の項目に basis がありません(期待する結果の根拠: コードの path:line か、既存のテストの assert)')
    if (item.basis && section.kind !== 'unit' && !section.fromDesign) fail(where, 'basis は単体の項目だけに付けます')
    // 結合・回帰・受け入れは画面で確かめる。コマンドを使うなら、画面で確かめられない理由を noScreen に書く
    if (test && section.kind !== 'unit') {
      const command = list(item.steps).some(text => COMMAND_STEP.test(String(text).trim()))
      if (command && !item.noScreen) {
        fail(where, section.fromDesign
          ? '操作にコマンドがあります。acceptance.md の操作を、画面で確かめる形に直します(画面で確かめられないなら、test.md で手段を「自動(…)」にします)'
          : '手順にコマンドがあります。画面で確かめる形に直すか、画面で確かめられない理由を noScreen に書きます')
      }
    }
    if (item.noScreen && (!test || section.kind === 'unit')) fail(where, 'noScreen は結合・回帰・受け入れの項目だけに付けます')

    const refs = list(item.requirement)
    if (section.kind === 'acceptance' && !refs.length) fail(where, '受け入れの項目に requirement がありません')
    if (section.kind !== 'acceptance' && refs.length) fail(where, 'requirement は受け入れの項目だけに付けます')
    for (const ref of refs) {
      if (!requirementIds.includes(ref)) fail(where, `requirement ${ref} が plan.json の requirements にありません`)
      else covered.add(ref)
    }
  }
}
if (own.some(section => section.kind === 'acceptance')) {
  if (!requirementIds.length) fail('plan.json', '受け入れの項目があるのに requirements がありません')
  for (const id of requirementIds) if (!covered.has(id)) fail('plan.json', `要件 ${id} を確かめる受け入れの項目がありません(duplicateOf の付いていないもの)`)
}

// --- ファイルをまたいだ整合(id の重なり・duplicateOf の先)
const items = new Map()
const sectionIds = new Map()
for (const section of sections) {
  if (sectionIds.has(section.id)) fail(`${section.file} ${section.id}`, `節の id が ${sectionIds.get(section.id)} と重なっています`)
  else sectionIds.set(section.id, section.file)
  for (const item of section.items ?? []) {
    if (items.has(item.id)) fail(`${section.file} ${item.id}`, `id が ${items.get(item.id).file} と重なっています`)
    else items.set(item.id, { item, kind: section.kind, file: section.file })
  }
}
for (const section of own) {
  for (const item of section.items ?? []) {
    if (!item.duplicateOf) continue
    const where = `${section.file} ${item.id}`
    const target = items.get(item.duplicateOf)
    if (!target) fail(where, `duplicateOf の ${item.duplicateOf} がありません`)
    else if (target.item.duplicateOf) fail(where, `duplicateOf の先 ${item.duplicateOf} も行わない項目です。行う項目を指します`)
    else if (TIER[target.kind] < TIER[section.kind]) fail(where, `duplicateOf は同じか上の階層(単体 → 結合 → 回帰・受け入れ)の項目を指します(${item.duplicateOf} は ${target.kind})`)
  }
}

// --- order.json(実施の順)
let orderOk = true
if (order && !onlyName) {
  const bad = (where, message) => { fail(where, message); orderOk = false }
  if (!Array.isArray(order.groups) || !order.groups.length) bad('order.json', 'groups を1つ以上の配列にします')
  const direct = []
  const merged = []
  const groupIds = new Set()
  const keyed = new Map()
  const entries = []
  let position = 0
  let sawAfterCleanup = false
  for (const [g, group] of (order.groups ?? []).entries()) {
    const at = `order.json groups[${g}]`
    if (!group || typeof group.id !== 'string' || !ID_FORMAT.test(group.id) || !group.title || !Array.isArray(group.cases) || !group.cases.length) {
      bad(at, 'id(英数字とハイフン)・title・1つ以上の cases が要ります')
      continue
    }
    if (group.who !== undefined && typeof group.who !== 'string') bad(at, 'who は文字列にします')
    if (group.note !== undefined && typeof group.note !== 'string') bad(at, 'note は文字列にします')
    checkWording(at, [['title', group.title], ['note', group.note]])
    if (group.afterCleanup !== undefined && typeof group.afterCleanup !== 'boolean') bad(at, 'afterCleanup は true か false にします')
    if (group.flow !== undefined && group.flow !== true) bad(at, 'flow は true だけを書きます(流れでない節には書きません)')
    if (group.afterCleanup === true) sawAfterCleanup = true
    else if (sawAfterCleanup) bad(at, '後始末のあとに行うグループ(afterCleanup)より後ろに、ふつうのグループがあります')
    if (groupIds.has(group.id.toLowerCase())) bad(at, `id ${group.id} が重なっています`)
    groupIds.add(group.id.toLowerCase())

    for (const [c, entry] of group.cases.entries()) {
      const where = `${at}.cases[${c}]`
      if (typeof entry === 'string') {
        direct.push(entry)
        position++
        continue
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        bad(where, '項目の id の文字列か、統合した項目のオブジェクトにします')
        continue
      }
      const allowed = ['merge', 'id', 'key', 'title', 'given', 'steps', 'expect', 'priority', 'scenario']
      for (const key of Object.keys(entry)) if (!allowed.includes(key)) bad(where, `${key} は統合した項目には書けません(${allowed.join(' / ')})`)
      if (!Array.isArray(entry.merge) || !entry.merge.length || entry.merge.some(id => typeof id !== 'string' || !id)) {
        bad(where, 'merge は1つ以上の項目の id の配列にします')
      }
      else {
        const twice = entry.merge.filter((id, index) => entry.merge.indexOf(id) !== index)
        if (twice.length) bad(where, `merge の中で ${[...new Set(twice)].join(', ')} が重なっています`)
        merged.push(...entry.merge)
      }
      if (entry.id !== undefined && (typeof entry.id !== 'string' || !/^[A-Za-z0-9+-]+$/.test(entry.id))) bad(where, 'id は英数字・ハイフン・+ にします')
      if (entry.key !== undefined) {
        if (typeof entry.key !== 'string' || !ID_FORMAT.test(entry.key)) bad(where, 'key は英数字とハイフンにします')
        else if (keyed.has(entry.key)) bad(where, `key「${entry.key}」が ${keyed.get(entry.key).where} と重なっています`)
        else keyed.set(entry.key, { position, where })
      }
      if (typeof entry.title !== 'string' || !entry.title) bad(where, 'title が要ります')
      if (entry.given !== undefined && typeof entry.given !== 'string') bad(where, 'given は文字列にします')
      for (const key of ['steps', 'expect']) if (!isText(entry[key])) bad(where, `${key} が要ります(文字列か、空でない文字列の配列)`)
      if (entry.priority !== undefined && !PRIORITIES.includes(entry.priority)) bad(where, `priority は ${PRIORITIES.join(' / ')} のどれかにします`)
      if (entry.scenario !== undefined && !SCENARIOS.includes(entry.scenario)) bad(where, SCENARIO_MESSAGE)
      checkWording(where, [['title', entry.title], ['given', entry.given], ['steps', entry.steps], ['expect', entry.expect]])
      if (JSON.stringify(entry).includes(UNKNOWN)) fail(where, `${UNKNOWN} が残っています。ユーザーに聞いて埋めます`)
      entries.push({ entry, position, where })
      position++
    }
  }
  for (const { entry, position: at, where } of entries) {
    for (const key of ['title', 'given', 'steps', 'expect']) {
      for (const text of list(entry[key])) {
        for (const match of String(text).matchAll(/@([A-Za-z0-9-]+)/g)) {
          const target = keyed.get(match[1])
          if (target && target.position >= at) bad(where, `${key} の @${match[1]} が自分自身か後ろの項目を指しています`)
        }
      }
    }
  }
  const testItems = [...items.values()].filter(found => TEST_KINDS.includes(found.kind))
  const directCount = new Map()
  for (const id of direct) directCount.set(id, (directCount.get(id) ?? 0) + 1)
  const mergedSet = new Set(merged)
  const listed = new Set([...direct, ...merged])
  for (const found of testItems) {
    if (!found.item.duplicateOf && !listed.has(found.item.id)) bad('order.json', `行う項目 ${found.item.id} がどのグループにもありません`)
  }
  for (const id of listed) {
    const found = items.get(id)
    if (!found) bad('order.json', `下書きに無い項目 ${id} があります`)
    else if (!TEST_KINDS.includes(found.kind)) bad('order.json', `${id} は準備・後始末の項目です(準備・後始末は order.json に書かず、最初と最後に自動で並びます)`)
    else if (found.item.duplicateOf) bad('order.json', `行わない項目 ${id} があります(duplicateOf: ${found.item.duplicateOf})`)
    if ((directCount.get(id) ?? 0) > 1) bad('order.json', `${id} が ${directCount.get(id)} 回あります`)
    if (directCount.get(id) && mergedSet.has(id)) bad('order.json', `${id} が、そのままの項目と統合した項目の merge の両方にあります`)
  }
}

// --- 正本を組み立ててみる
let expected = null
if (!onlyName && orderOk) {
  try {
    expected = buildManifest(data)
  }
  catch (error) {
    fail('正本', `組み立てられません: ${error.message}`)
  }
}
if (expected) {
  const finalItems = expected.sections.flatMap(section => section.items)
  const seen = new Set()
  for (const item of finalItems) {
    if (seen.has(item.id)) fail('正本', `id ${item.id} が重なっています(統合した項目の id を order.json で決めます)`)
    seen.add(item.id)
  }
  if (requirementIds.length) {
    const referenced = new Set(finalItems.flatMap(item => list(item.requirement)))
    for (const id of requirementIds) if (!referenced.has(id)) fail('正本', `要件 ${id} を確かめる項目がありません`)
  }
  if (order) for (const group of order.groups ?? []) for (const entry of group.cases ?? []) {
    if (typeof entry === 'object' && entry && items.has(mergedId(entry)) && !list(entry.merge).includes(mergedId(entry))) {
      fail('order.json', `統合した項目の id ${mergedId(entry)} が、ほかの項目の id と重なっています`)
    }
  }
}

// --- 正本の manifest.json が、今の下書きから作ったものと合っているか
const manifestDir = value('--manifest')
if (manifestDir && expected) {
  const path = join(resolve(manifestDir), 'manifest.json')
  if (!existsSync(path)) fail(path, 'ありません')
  else {
    let current
    try {
      current = readJson(path)
    }
    catch (error) {
      fail(path, error.message)
    }
    if (current) {
      const shape = manifest => (manifest.sections ?? []).map(section => `${section.flow === true ? '(流れ) ' : ''}${section.title}: ${(section.items ?? []).map(item => item.id).join(', ')}`)
      const want = shape(expected)
      const have = shape(current)
      if (want.join('\n') !== have.join('\n')) fail(path, '節と項目の並び(流れかどうかも)が、今の下書きと違います。結果が無ければ build-manifest.mjs で作り直し、結果があれば やり直し(`test-run/retest/`) の手順で新しいフォルダに作ります')
      const currentItems = new Map((current.sections ?? []).flatMap(section => section.items ?? []).map(item => [item.id, item]))
      for (const item of expected.sections.flatMap(section => section.items)) {
        const found = currentItems.get(item.id)
        if (found && caseView(found) !== caseView(item)) fail(path, `${item.id} の中身(title・前提・手順・期待する結果など)が、今の下書きと違います`)
      }
    }
  }
}

for (const line of errors) console.log(`エラー ${line}`)
const total = sections.reduce((sum, section) => sum + (section.items ?? []).length, 0)
const inactive = sections.reduce((sum, section) => sum + (section.items ?? []).filter(item => item.duplicateOf).length, 0)
console.log(`\n${onlyName ?? 'cases/'}: 下書き ${total} 項目(行わない ${inactive})${expected ? `、正本 ${expected.sections.reduce((sum, section) => sum + section.items.length, 0)} 項目` : ''}`)
console.log(errors.length ? `エラー ${errors.length} 件。` : 'エラーはありません。')
process.exit(errors.length ? 1 : 0)
