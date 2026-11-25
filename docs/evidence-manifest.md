# エビデンスの manifest.json

書いたものが実際にどう出るかは、見本([`sample/evidence/`](/sample/evidence/))で見られる。
ビューアを `?folder=sample` で開く。

エビデンスビューアが読むファイル。動画・画像・テキストと同じDriveのフォルダに `manifest.json` という名前で置く。
ビューアはフォルダの中をファイル名で探すので、`video` / `image` / `file` にはファイル名だけを書く(パスは書かない)。

```json
{
  "schema": "dev-workbench/evidence@1",
  "title": "PR #22 アイデア一覧と詳細を作る",
  "source": {
    "repository": "owner/name",
    "pullRequest": 22,
    "commit": "4110199",
    "url": "https://github.com/owner/name/pull/22"
  },
  "recordedAt": "2026-11-03",
  "summary": { "ok": 76, "partial": 2, "ng": 0 },
  "notes": ["確かめ方の前提など、全体にかかること"],
  "sections": [
    {
      "title": "追加する",
      "items": [
        {
          "id": "1",
          "title": "最終行に入力して Enter で行が足される",
          "result": "ok",
          "checks": ["○ 一覧: [\"ひとつめ\"]", "○ フォーカス: 新しいアイデア"],
          "note": "補足があれば",
          "video": "01-add-stays.webm"
        },
        {
          "id": "2",
          "title": "足した行に、入力した文字が残る",
          "result": "ok",
          "checks": ["○ 一覧: [\"ひとつめ\", \"ふたつめ\"]"],
          "image": "02-add-keeps-text.png"
        }
      ]
    }
  ],
  "attachments": [
    { "title": "test", "file": "00-test.txt" }
  ]
}
```

| 項目 | 必須 | 中身 |
|---|---|---|
| `schema` | ○ | `dev-workbench/evidence@1` |
| `title` | ○ | 画面の見出し |
| `source` | | どこの何の確認か。`url` があれば見出しの下にリンクで出す |
| `recordedAt` | | 撮った日 |
| `summary` | | 結果の件数。`ok`(期待どおり)/ `partial`(一部だけ確認)/ `ng`(期待どおりでない) |
| `notes` | | 一覧の上に出す、全体にかかる注意 |
| `sections[].title` | ○ | 受入確認の節 |
| `sections[].kind` | | テストの種別。`setup` / `unit` / `integration` / `regression` / `acceptance` / `cleanup`。節の見出しに添えて出す |
| `sections[].flow` | | `true` だけ。その節を流れ(続けて行い、前の項目の結果が次の前提になる項目のまとまり)として出す。見出しが「流れ: <節の名前>」になり、項目を字下げして左に縦の線、行に何番目か(`2/3`。行わない項目も数える)。項目が1件だけなら `check-manifest.mjs` が注意を出す |
| `sections[].items[].id` | | 番号。一覧と見出しに出す |
| `sections[].items[].title` | ○ | 項目の確認内容(何が正しいと言えれば合格か) |
| `sections[].items[].result` | | `ok` / `partial` / `ng`。無ければ未実施。一覧に ✓ / ! / ✕ で出す(`partial` と `ng` は行に色を敷いて目立たせる) |
| `sections[].items[].checks` | | 確かめたこと(1行ずつ)。頭に ○ / △ / × を付けると、一覧と同じ印で出す |
| `sections[].items[].note` | | 補足 |
| `sections[].items[].requirement` | | 満たす要件の `id`(`R1`、または `["R1", "R2"]`)。受け入れのテストの項目に付ける |
| `sections[].items[].priority` | | `high` / `mid` / `low` |
| `sections[].items[].review` | | `true` だけ。見てほしい項目。一覧の文の頭に黄色の ★ を付けて太字にし、詳細の札の先頭に「★ 見てほしい」を出す。並びは変えない。行わない項目(`duplicateOf`)には出さない(`check-manifest.mjs` が注意を出す) |
| `sections[].items[].scenario` | | `normal`(正常系・緑)/ `error`(異常系・赤)/ `boundary`(境界・黄)。一覧の行と詳細に札で出す。分け方は `.claude/skills/test-cases/reference/writing.md` の「正常系・異常系・境界と流れ」 |
| `sections[].items[].given` | | 前提。満たしていないと結果が変わる状態 |
| `sections[].items[].steps` | | 操作の手順(文字列の配列。番号を振って出す)。1つなら文字列でもよい |
| `sections[].items[].expect` | | 期待する結果(文字列の配列。確認することごとに分ける)。1つなら文字列でもよい |
| `sections[].items[].basis` | | 期待する結果の根拠(コードの `path:line` など)。折りたたんで出す |
| `sections[].items[].duplicateOf` | | ほかの項目で確かめられるので行わない項目の、その項目の `id`。打ち消し線と「行わない」の札で出し、件数に数えない |
| `sections[].items[].video` | | 動画のファイル名(`.webm` `.mp4` `.mov`)。`image` とはどちらか一方 |
| `sections[].items[].image` | | 画像のファイル名(`.png` `.jpg` `.jpeg` `.webp`)。`video` とはどちらか一方 |
| `requirements[]` | | 要件の一覧。`id`(`R1` など)と `text`。一覧の上に出す |
| `attachments[]` | | 添付。`.webm` `.mp4` `.mov` はプレーヤーで、`.png` `.jpg` `.jpeg` `.webp` は画像で、それ以外はテキストとして開く |

`review`・`scenario`・`flow` は、どれも任意。書かなければ今までどおりに出る(既存の manifest は書き直さない)。決まった値でなければ、ビューアは出さず、`check-manifest.mjs` がエラーにする。
テストケースから作る正本では、`review` は組み立て(`build-manifest.mjs`)が受け入れの項目に付ける(`.claude/skills/test-cases/reference/format.md`)。

`video` と `image` は、1つの項目にはどちらか一方だけを書く(両方あれば動画を見せる)。どちらも無い項目も押せて、前提・手順・期待する結果と確かめたことを出す。
どちらで撮るか(画像か動画か)の選び方は、`.claude/skills/test-run/reference/capture.md`。
一覧の行の右端に「▶ 動画」「▣ 画像」(添付は「≡ テキスト」も)の札が出るので、押す前にどちらか分かる。流れの何番目かと正常系・異常系・境界の札は、その左に並ぶ。
動画も画像も無い項目は、代わりに「未実施」「行わない」の札になり、同じことを二度言わないよう結果の印は出ない。

動画と画像は、プレーヤーと同じ場所・同じ大きさに出る。次へ/前へは項目に止まり、行わない項目(`duplicateOf`)と添付のテキストは飛ばす。
連続再生で次へ進むのは動画が終わった時だけで、動画・画像のある次の項目まで進む(画像で勝手に進むことはない)。

`notes`・`title`・`checks` などの文字の中で `` `…` `` で囲んだところは、等幅で出す。`source.url` は `http:` / `https:` の時だけリンクになる。

## テストケースとして書く

テストケースは、`result` を書かずに(未実施として)同じ `manifest.json` に書く。
テストを行ったら、項目ごとに `result`・`checks`・`video` か `image` を足し、`summary` を書く。

```json
{
  "id": "tc02-01",
  "title": "保存した名前が一覧に出ること",
  "priority": "high",
  "given": "名前が空の行が1件ある",
  "steps": ["1行目の「名前」に `ひとつめ` を入れる", "「保存」を押す"],
  "expect": ["手順2: 一覧の1行目: `ひとつめ`", "手順2: トースト: `保存しました`"]
}
```

- `title` は「何が正しいと言えれば合格か」を1文で書く(操作や期待する結果の言い換えにしない)
- 未実施の項目は一覧で「未実施」の札になり、押すと前提・手順・期待する結果が出る(動画・画像はまだ無い)
- `summary` は、結果を書いた項目だけを数える。未実施の数は書かない(ビューアが数える)

文字はすべてテキストとして表示する(HTMLとしては解釈しない)。
