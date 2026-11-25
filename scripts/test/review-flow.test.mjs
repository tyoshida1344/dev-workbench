// test-cases の build-manifest.mjs・check-cases.mjs が、見てほしい(★ review)・正常系と異常系(scenario)・流れ(flow)を
// 決まり(docs/evidence-manifest.md・test-cases/reference/format.md)どおりに扱うかのテスト。
// 作業フォルダを一時フォルダに作り、スクリプトを動かして、終了コードと manifest.json を確かめる。

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', '.claude', 'skills', 'test-cases', 'scripts')
const run = (name, args) => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [join(scripts, name), ...args], { encoding: 'utf8' })
  return { status, out: stdout + stderr }
}

const ACCEPTANCE = `# 受け入れ基準: 名前を保存する(#9)

## 要件

| ID | 前提 | 操作 | 期待する結果 | spec.md の節 |
|----|------|------|--------------|--------------|
| AC01 | 名前が空 | 名前を入れる → 「保存」を押す | 一覧に名前が出る | 1.2 |

## 既存機能への影響

| ID | 前提 | 操作 | 期待する結果 | spec.md の節 |
|----|------|------|--------------|--------------|
| AC02 | 一覧に1件ある | 検索に名前を入れる | 検索の結果が変わらない | 1.4 |

## 設計で追加した仕様

| ID | 前提 | 操作 | 期待する結果 | spec.md の節 |
|----|------|------|--------------|--------------|
| AC03 | 名前が空 | 51文字の名前を入れる → 「保存」を押す | 知らせ \`50文字までです\` が出る | 2.1 |
`

const unit = (items = [{ id: 'tc01-01', title: '空の名前を断る', priority: 'mid', scenario: 'error', given: '名前が空', steps: ['「保存」を押す'], expect: '知らせ `名前を入れてください` が出る', basis: 'save.js:10' }]) =>
  JSON.stringify({ sections: [{ id: 'tc01', title: 'TC-01 保存の分岐', kind: 'unit', items }] })
const integration = JSON.stringify({ sections: [{ id: 'tc02', title: 'TC-02 保存の流れ', kind: 'integration', items: [
  { id: 'tc02-01', title: '名前を入れられる', priority: 'high', scenario: 'normal', given: '名前が空', steps: ['名前に `ひとつめ` を入れる'], expect: '名前の欄: `ひとつめ`' },
  { id: 'tc02-02', title: '保存の知らせが出る', priority: 'high', given: '名前が入っている', steps: ['「保存」を押す'], expect: '知らせ: `保存しました`' },
] }] })

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'review-flow-'))
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

function build(dir, args = []) {
  const out = join(dir, 'evidence', 'x')
  const built = run('build-manifest.mjs', [dir, '--out', out, ...args])
  assert.equal(built.status, 0, built.out)
  return JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
}

const items = manifest => manifest.sections.flatMap(section => section.items)
const byId = (manifest, id) => items(manifest).find(item => item.id === id)

test('受け入れの項目(acceptance.md の全部の表)にだけ ★ を付け、ほかの種別の scenario はそのまま写す', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/unit.json': unit() })
  try {
    assert.equal(run('check-cases.mjs', [dir]).status, 0)
    const manifest = build(dir)
    assert.equal(byId(manifest, 'AC01').review, true)
    assert.equal(byId(manifest, 'AC02').review, true)
    assert.equal(byId(manifest, 'AC03').review, true)
    assert.equal(byId(manifest, 'tc01-01').review, undefined)
    assert.equal(byId(manifest, 'tc01-01').scenario, 'error')
    // ライト版の設計から作る受け入れの項目には、正常系・異常系も流れも付かない
    assert.equal(byId(manifest, 'AC01').scenario, undefined)
    assert.ok(manifest.sections.every(section => section.flow === undefined))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('order.json のグループの flow を節に写し、統合した項目の scenario と ★ を決まりどおりに付ける', () => {
  const order = { groups: [
    { id: 'g01', title: '保存する', flow: true, cases: ['tc02-01', { merge: ['tc02-02', 'AC01'], title: '保存すると一覧に出る', steps: ['「保存」を押す'], expect: '一覧に `ひとつめ`', scenario: 'normal' }] },
    { id: 'g02', title: 'ほか', cases: ['AC02', 'AC03', { merge: ['tc01-01'], title: '空の名前を断る', steps: ['「保存」を押す'], expect: '知らせが出る' }] },
  ] }
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/unit.json': unit(), 'cases/integration.json': integration, 'cases/order.json': JSON.stringify(order) })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 0, checked.out)
    const manifest = build(dir)
    const [flow, other] = manifest.sections
    assert.equal(flow.flow, true)
    assert.equal(other.flow, undefined)
    assert.equal(byId(manifest, 'tc02-01').scenario, 'normal')
    const merged = byId(manifest, 'tc02-02+AC01')
    assert.equal(merged.review, true, '受け入れの項目を含む統合した項目には ★')
    assert.equal(merged.scenario, 'normal')
    const plain = byId(manifest, 'tc01-01')
    assert.equal(plain.review, undefined, '受け入れの項目を含まない統合した項目には ★ を付けない')
    assert.equal(plain.scenario, undefined, '元の項目の scenario は、統合した項目に写さない')
    assert.equal(byId(manifest, 'AC02').review, true)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('下書きの scenario・グループの flow の誤った値と、下書きの review を check-cases.mjs がエラーにする', () => {
  const order = { groups: [{ id: 'g01', title: '保存する', flow: 'yes', cases: ['tc01-01', { merge: ['tc01-02'], title: 'まとめ', steps: ['押す'], expect: '出る', scenario: 'abnormal' }] }] }
  const drafts = unit([
    { id: 'tc01-01', title: '空の名前を断る', priority: 'mid', scenario: 'bad', given: '名前が空', steps: ['押す'], expect: '出る', basis: 'save.js:10' },
    { id: 'tc01-02', title: '★ を書いた', priority: 'mid', review: true, given: '名前が空', steps: ['押す'], expect: '出る', basis: 'save.js:12' },
  ])
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/unit.json': drafts, 'cases/order.json': JSON.stringify(order) })
  try {
    const { status, out } = run('check-cases.mjs', [dir])
    assert.equal(status, 1, out)
    assert.match(out, /tc01-01: scenario は normal \/ error \/ boundary のどれかにします/)
    assert.match(out, /tc01-02: review は下書きに書きません\(受け入れの項目に、組み立てが付けます\)/)
    assert.match(out, /groups\[0\][^\n]*: flow は true だけを書きます\(流れでない節には書きません\)/)
    assert.match(out, /groups\[0\]\.cases\[1\][^\n]*: scenario は normal \/ error \/ boundary のどれかにします/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('証跡には流れを出さず、行わない受け入れの項目には ★ を付けない', () => {
  const plan = { title: '名前を保存する', requirements: [{ id: 'R1', text: '保存できる' }] }
  const acceptance = { sections: [{ id: 'tc03', title: 'TC-03 受け入れ', kind: 'acceptance', items: [
    { id: 'tc03-01', title: 'R1 を満たす', requirement: 'R1', priority: 'high', given: '名前が空', steps: ['保存する'], expect: '一覧に出る' },
    { id: 'tc03-02', title: 'R1 を満たす(重なり)', requirement: 'R1', priority: 'high', given: '名前が空', steps: ['保存する'], expect: '一覧に出る', duplicateOf: 'tc03-01' },
  ] }] }
  const order = { groups: [{ id: 'g01', title: '保存する', flow: true, cases: ['tc03-01', 'tc02-01'] }] }
  const dir = workspace({ 'cases/plan.json': JSON.stringify(plan), 'cases/acceptance.json': JSON.stringify(acceptance), 'cases/integration.json': integration, 'cases/order.json': JSON.stringify(order) })
  try {
    const trail = run('build-manifest.mjs', [dir, '--trail'])
    assert.equal(trail.status, 0, trail.out)
    const manifest = JSON.parse(readFileSync(join(dir, 'cases', 'manifest.json'), 'utf8'))
    assert.ok(manifest.sections.every(section => section.flow === undefined))
    assert.equal(byId(manifest, 'tc03-01').review, true)
    assert.equal(byId(manifest, 'tc03-02').review, undefined)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('前の結果を引き継ぐ時、★ と scenario の違いはやり直しに数えない。下書きとの照合では知らせる', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/integration.json': integration })
  try {
    // 前の正本: この変更の前の形(★ も scenario も無い)に結果がある
    const before = build(dir)
    for (const item of items(before)) {
      delete item.review
      delete item.scenario
      item.result = 'ok'
    }
    before.summary = { ok: items(before).length, partial: 0, ng: 0 }
    const old = join(dir, 'evidence', 'old')
    mkdirSync(old, { recursive: true })
    writeFileSync(join(old, 'manifest.json'), JSON.stringify(before))
    // 下書きで scenario を書き足しても、やり直しを求めずに引き継げる
    writeFileSync(join(dir, 'cases', 'integration.json'), integration.replace('"title":"保存の知らせが出る",', '"title":"保存の知らせが出る","scenario":"normal",'))
    const next = join(dir, 'evidence', 'new')
    const carried = run('build-manifest.mjs', [dir, '--out', next, '--results-from', old])
    assert.equal(carried.status, 0, carried.out)
    const manifest = JSON.parse(readFileSync(join(next, 'manifest.json'), 'utf8'))
    assert.equal(byId(manifest, 'AC01').result, 'ok')
    assert.equal(byId(manifest, 'AC01').review, true)
    assert.equal(byId(manifest, 'tc02-02').result, 'ok')
    // 照合: 正本を作った後に scenario を書き換えると、作り直しを知らせる
    writeFileSync(join(dir, 'cases', 'integration.json'), integration.replace('"scenario":"normal"', '"scenario":"boundary"'))
    const checked = run('check-cases.mjs', [dir, '--manifest', next])
    assert.equal(checked.status, 1, checked.out)
    assert.match(checked.out, /tc02-01 の中身[^\n]*今の下書きと違います/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('前の結果を引き継ぐ時、確かめる中身(前提)が変わった項目は、今どおりやり直しを求めて止まる', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/integration.json': integration })
  try {
    const before = build(dir)
    for (const item of items(before)) item.result = 'ok'
    const old = join(dir, 'evidence', 'old')
    mkdirSync(old, { recursive: true })
    writeFileSync(join(old, 'manifest.json'), JSON.stringify(before))
    writeFileSync(join(dir, 'cases', 'integration.json'), integration.replace('"given":"名前が入っている"', '"given":"名前が2文字入っている"'))
    const carried = run('build-manifest.mjs', [dir, '--out', join(dir, 'evidence', 'new'), '--results-from', old])
    assert.equal(carried.status, 1, carried.out)
    assert.match(carried.out, /中身が前回と変わった項目は、やり直しが要ります。--redo に足します: tc02-02/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('照合では、グループの流れを書き換えたことも知らせる', () => {
  const order = flow => ({ groups: [{ id: 'g01', title: '保存する', ...(flow ? { flow: true } : {}), cases: ['tc02-01', 'tc02-02'] }, { id: 'g02', title: '受け入れ', cases: ['AC01', 'AC02', 'AC03'] }] })
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/integration.json': integration, 'cases/order.json': JSON.stringify(order(false)) })
  try {
    build(dir)
    writeFileSync(join(dir, 'cases', 'order.json'), JSON.stringify(order(true)))
    const checked = run('check-cases.mjs', [dir, '--manifest', join(dir, 'evidence', 'x')])
    assert.equal(checked.status, 1, checked.out)
    assert.match(checked.out, /節と項目の並び\(流れかどうかも\)が、今の下書きと違います/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
