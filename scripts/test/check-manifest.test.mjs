// scripts/check-manifest.mjs のテスト。fixtures/ の manifest を検査させ、終了コードと出力を確かめる。
//   main            main の形(新しい欄なし、result は必ずある、動画・画像の無い結果の項目を含む)。通る
//   missing-result  result が無いのに動画がある。通るが、書き忘れの注意を出す
//   null-manifest   manifest が null。エラー
//   null-parts      節・項目・要件・添付に null。例外で落ちずにエラーとして数える
//   bad-source-url  source.url が http / https でない。エラー

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const script = join(root, 'scripts', 'check-manifest.mjs')

function check(folder, scriptPath = script) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [scriptPath, folder], { encoding: 'utf8' })
  return { status, out: stdout + stderr }
}
const fixture = name => join(here, 'fixtures', name)

/** 例外のまま落ちていない(Node の呼び出し履歴が出ていない) */
function noCrash(out) {
  assert.doesNotMatch(out, /TypeError|ReferenceError|SyntaxError|\n\s+at /)
}

test('main の形の manifest は通る。動画・画像の無い結果の項目は注意だけ', () => {
  const { status, out } = check(fixture('main'))
  assert.equal(status, 0, out)
  assert.match(out, /項目 3 件\(✓2 \/ !1 \/ ✕0\)、添付 1 件/)
  assert.match(out, /注意 {2}sections\[0\]\.items\[2\] \(#3\): 結果はあるのに、動画も画像もありません/)
  assert.match(out, /エラーはありません。/)
  noCrash(out)
})

test('result が無いのに動画がある項目は、書き忘れとして注意を出す', () => {
  const { status, out } = check(fixture('missing-result'))
  assert.equal(status, 0, out)
  assert.match(out, /注意 {2}sections\[0\]\.items\[0\] \(#1\): 動画か画像はあるのに、結果\(result\)がありません/)
  assert.match(out, /未実施 1/)
})

test('manifest が null ならエラー', () => {
  const { status, out } = check(fixture('null-manifest'))
  assert.equal(status, 1, out)
  assert.match(out, /エラー manifest\.json: オブジェクト/)
  noCrash(out)
})

test('節・項目・要件・添付が null でも落ちずに、エラーとして数える', () => {
  const { status, out } = check(fixture('null-parts'))
  assert.equal(status, 1, out)
  assert.match(out, /エラー requirements\[0\]: /)
  assert.match(out, /エラー sections\[0\]: 節がオブジェクトではありません/)
  assert.match(out, /エラー sections\[1\]\.items\[0\]: 項目がオブジェクトではありません/)
  assert.match(out, /エラー attachments\[0\]: 添付がオブジェクトではありません/)
  assert.match(out, /エラー 4 件/)
  noCrash(out)
})

test('source.url が http / https でなければエラー', () => {
  const { status, out } = check(fixture('bad-source-url'))
  assert.equal(status, 1, out)
  assert.match(out, /エラー source\.url: http: か https: のURLにします\(今は "javascript:alert\(1\)"\)/)
})

test('無いフォルダはエラー', () => {
  const { status, out } = check(fixture('no-such-folder'))
  assert.equal(status, 1, out)
  assert.match(out, /フォルダが読めません/)
})

test('config.json の site の末尾に / が無くても、ビューアの URL を正しく作る', () => {
  // check-manifest.mjs と、それが読むもの(config.json・build-manifest.mjs)を、リポジトリと同じ並びで一時フォルダに写す
  const work = mkdtempSync(join(tmpdir(), 'dev-workbench-test-'))
  try {
    mkdirSync(join(work, 'scripts'))
    cpSync(script, join(work, 'scripts', 'check-manifest.mjs'))
    cpSync(join(root, '.claude', 'skills', 'test-cases', 'scripts', 'build-manifest.mjs'), join(work, '.claude', 'skills', 'test-cases', 'scripts', 'build-manifest.mjs'), { recursive: true })
    writeFileSync(join(work, '.claude', 'skills', 'config.json'), JSON.stringify({ site: 'https://example.test/workbench' }))
    const { status, out } = check(fixture('main'), join(work, 'scripts', 'check-manifest.mjs'))
    assert.equal(status, 0, out)
    assert.match(out, /Drive に同期したら: https:\/\/example\.test\/workbench\/evidence\/\?folder=<フォルダID>/)
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
})
