// test-cases の build-manifest.mjs・check-cases.mjs が、設計の受け入れ基準(acceptance.md)から受け入れの項目を作るかのテスト。
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

const ACCEPTANCE = `# 受け入れ基準: アイデアを消す(#2)

## 要件

| ID | 前提 | 操作 | 期待する結果 | spec.md の節 |
|----|------|------|--------------|--------------|
| AC01 | 一覧に2件ある | 「消す」を押す → 確かめの窓で「消す」を押す | その行が一覧から無くなる | 1.2 |
| AC02 | 一覧に2件ある | 1件を消す | 見出しの件数が \`1件\` になる | 1.2 |

## 既存機能への影響

| ID | 前提 | 操作 | 期待する結果 | spec.md の節 |
|----|------|------|--------------|--------------|
| AC03 | 一覧に2件ある | 1件を消す | 消さなかった行は一覧に残る | 1.4 |
`

const TEST = `# テスト方針・計画

| AC | 層 | 手段 | 担当 |
|----|----|------|------|
| AC01 | 画面 | 手動 | 開発者 |
| AC02 | 部品 | 自動(scripts/test) | 開発者 |
| AC03 | 画面 | 手動 | 開発者 |
`

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'acceptance-'))
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

test('acceptance.md だけ(cases/ が無い)でも、手動の AC から受け入れの項目と要件を作る', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'test.md': TEST })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 0, checked.out)
    const out = join(dir, 'evidence', 'x')
    const built = run('build-manifest.mjs', [dir, '--out', out])
    assert.equal(built.status, 0, built.out)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.equal(manifest.title, 'アイデアを消す(#2)')
    assert.deepEqual(manifest.requirements.map(requirement => requirement.id), ['AC01', 'AC03'])
    assert.deepEqual(manifest.sections.map(section => section.title), ['受け入れ: 要件', '受け入れ: 既存機能への影響'])
    const [first] = manifest.sections[0].items
    assert.deepEqual(first.steps, ['「消す」を押す', '確かめの窓で「消す」を押す'])
    assert.equal(first.requirement, 'AC01')
    assert.equal(first.priority, 'high')
    assert.equal(first.basis, 'spec.md の 1.2')
    assert.match(manifest.notes.join('\n'), /AC02\(自動\(scripts\/test\)\)/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cases/ の補う項目と、acceptance.md の受け入れの項目を一緒に並べる', () => {
  const regression = { sections: [{ id: 'tc01', title: 'TC-01 一覧の並び', kind: 'regression', items: [{ id: 'tc01-01', title: '消したあとも並びが変わらない', priority: 'mid', given: '一覧に3件ある', steps: ['2件目を消す'], expect: '残りの2件が前と同じ順に並ぶ' }] }] }
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/plan.json': JSON.stringify({ title: '#2 アイデアを消す' }), 'cases/regression.json': JSON.stringify(regression) })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 0, checked.out)
    const out = join(dir, 'evidence', 'x')
    assert.equal(run('build-manifest.mjs', [dir, '--out', out]).status, 0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.equal(manifest.title, '#2 アイデアを消す')
    assert.deepEqual(manifest.sections.map(section => section.kind), ['regression', 'acceptance', 'acceptance'])
    // test.md が無い時は、すべての AC を手で確かめる
    assert.deepEqual(manifest.requirements.map(requirement => requirement.id), ['AC01', 'AC02', 'AC03'])
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('acceptance.md と cases/acceptance.json の両方がある時は、作らずに止める', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'cases/acceptance.json': JSON.stringify({ sections: [] }) })
  try {
    const built = run('build-manifest.mjs', [dir, '--out', join(dir, 'evidence', 'x')])
    assert.equal(built.status, 1)
    assert.match(built.out, /受け入れの項目が2か所にあります/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('ID の形・空のセル・test.md との食い違いを、check-cases.mjs がエラーにする', () => {
  const broken = ACCEPTANCE.replace('| AC03 | 一覧に2件ある |', '| C3 | 一覧に2件ある |').replace('| 1件を消す | 見出し', '|  | 見出し')
  const dir = workspace({ 'acceptance.md': broken, 'test.md': TEST.replace('AC03', 'AC09') })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 1, checked.out)
    assert.match(checked.out, /ID は AC01 の形にします/)
    assert.match(checked.out, /AC02: 前提・操作・期待する結果のどれかが空です/)
    assert.match(checked.out, /test\.md: AC09 が acceptance\.md にありません/)
    assert.equal(run('build-manifest.mjs', [dir, '--out', join(dir, 'evidence', 'x')]).status, 1)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('AC の表が無い前の書き方の acceptance.md は読まず、今までどおり cases/ の要件と受け入れの項目で作る', () => {
  const plan = { title: '#1 前の書き方', requirements: [{ id: 'R1', text: '消せる' }] }
  const acceptance = { sections: [{ id: 'tc01', title: 'TC-01 要件の受け入れ', kind: 'acceptance', items: [{ id: 'tc01-01', title: 'R1 を満たす', requirement: 'R1', priority: 'high', given: '一覧に1件ある', steps: ['消す'], expect: '一覧から無くなる' }] }] }
  const dir = workspace({ 'acceptance.md': '# 受け入れ基準\n\n## 要件\n\n- [ ] 消せる\n', 'cases/plan.json': JSON.stringify(plan), 'cases/acceptance.json': JSON.stringify(acceptance) })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 0, checked.out)
    assert.match(checked.out, /注意 {2}acceptance\.md に AC の表/)
    const out = join(dir, 'evidence', 'x')
    assert.equal(run('build-manifest.mjs', [dir, '--out', out]).status, 0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.deepEqual(manifest.requirements.map(requirement => requirement.id), ['R1'])
    assert.equal(manifest.sections[0].items[0].id, 'tc01-01')
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--file で1ファイルだけ見る時は、設計の表の誤りに巻き込まれない', () => {
  const unit = { sections: [{ id: 'tc01', title: 'TC-01 分岐', kind: 'unit', items: [{ id: 'tc01-01', title: '0件の時に案内が出る', priority: 'mid', given: '一覧が空', steps: ['一覧を開く'], expect: '案内が出る', basis: 'list.js:10' }] }] }
  const dir = workspace({ 'acceptance.md': ACCEPTANCE.replace('| AC03 |', '| C3 |'), 'cases/plan.json': JSON.stringify({ title: '#2' }), 'cases/unit.json': JSON.stringify(unit) })
  try {
    const checked = run('check-cases.mjs', [dir, '--file', join(dir, 'cases', 'unit.json')])
    assert.equal(checked.status, 0, checked.out)
    assert.equal(run('check-cases.mjs', [dir]).status, 1)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('列の名前が違う表は、項目を黙って落とさず、足りない列をエラーにする', () => {
  const dir = workspace({ 'acceptance.md': ACCEPTANCE.replaceAll('期待する結果', '期待結果'), 'test.md': TEST })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 1, checked.out)
    assert.match(checked.out, /「要件」の表に、期待する結果 の列がありません/)
    assert.doesNotMatch(checked.out, /test\.md: AC\d+ が acceptance\.md にありません/)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('短い区切りの行・CRLF・セルの少ない行・コードブロックの中の表を、ビューアと同じように扱う', () => {
  const text = [
    '# 受け入れ基準: 形の揺れ',
    '',
    '````',
    '```',
    '| ID | 前提 | 操作 | 期待する結果 |',
    '|-|-|-|-|',
    '| AC09 | コードブロックの中 | 読まない | 読まない |',
    '````',
    '',
    '## 要件',
    '',
    '| ID | 前提 | 操作 | 期待する結果 |',
    '|-|-|-|-|',
    '| AC01 | 一覧に1件ある | `a \\| b` を入れる | 出る |',
    '| AC02 | 少ない |',
  ].join('\r\n')
  const dir = workspace({ 'acceptance.md': text })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 1, checked.out)
    assert.doesNotMatch(checked.out, /TypeError|AC09/)
    assert.match(checked.out, /AC02: 前提・操作・期待する結果のどれかが空です/)
    const fixed = workspace({ 'acceptance.md': text.replace('\r\n| AC02 | 少ない |', '') })
    try {
      const out = join(fixed, 'evidence', 'x')
      const built = run('build-manifest.mjs', [fixed, '--out', out])
      assert.equal(built.status, 0, built.out)
      const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
      assert.deepEqual(manifest.sections[0].items.map(item => item.id), ['AC01'])
      assert.deepEqual(manifest.sections[0].items[0].steps, ['`a | b` を入れる'])
    }
    finally {
      rmSync(fixed, { recursive: true, force: true })
    }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('order.json で AC の id を並べられ、cases/ の無いフォルダでも --trail が書ける', () => {
  const order = { groups: [{ id: 'g01', title: '消す', cases: ['AC03', 'AC01'] }] }
  const dir = workspace({ 'acceptance.md': ACCEPTANCE, 'test.md': TEST, 'cases/order.json': JSON.stringify(order) })
  const bare = workspace({ 'acceptance.md': ACCEPTANCE })
  try {
    const checked = run('check-cases.mjs', [dir])
    assert.equal(checked.status, 0, checked.out)
    const out = join(dir, 'evidence', 'x')
    assert.equal(run('build-manifest.mjs', [dir, '--out', out]).status, 0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.deepEqual(manifest.sections[0].items.map(item => item.id), ['AC03', 'AC01'])
    const trail = run('build-manifest.mjs', [bare, '--trail'])
    assert.equal(trail.status, 0, trail.out)
    assert.ok(readFileSync(join(bare, 'cases', 'manifest.json'), 'utf8').includes('AC01'))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(bare, { recursive: true, force: true })
  }
})
