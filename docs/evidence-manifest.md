# エビデンスの manifest.json

書いたものが実際にどう出るかは、見本([`evidence/sample/`](../evidence/sample/))で見られる。
ビューアを `?base=sample/` を付けて開く。

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
| `sections[].items[].id` | | 番号。一覧と見出しに出す |
| `sections[].items[].title` | ○ | 受入確認の文言 |
| `sections[].items[].result` | | `ok` / `partial` / `ng`。一覧に ✓ / ! / ✕ で出す(`partial` と `ng` は行に色を敷いて目立たせる) |
| `sections[].items[].checks` | | 確かめたこと(1行ずつ)。頭に ○ / △ / × を付けると、一覧と同じ印で出す |
| `sections[].items[].note` | | 補足 |
| `sections[].items[].video` | | 動画のファイル名(`.webm` `.mp4` `.mov`)。`image` とはどちらか一方 |
| `sections[].items[].image` | | 画像のファイル名(`.png` `.jpg` `.jpeg` `.webp`)。`video` とはどちらか一方 |
| `attachments[]` | | 添付。`.webm` `.mp4` `.mov` はプレーヤーで、`.png` `.jpg` `.jpeg` `.webp` は画像で、それ以外はテキストとして開く |

`video` と `image` は、1つの項目にはどちらか一方だけを書く(両方あれば動画を見せる)。どちらも無い項目は押せない。
前後の変化を見せる必要がある項目は動画、1つの画面の状態を見れば済む項目は画像にする(押して待たずに見られる)。

動画と画像は、プレーヤーと同じ場所・同じ大きさに出る。次へ/前へは動画と画像の両方で止まり、添付のテキストは飛ばす。
連続再生で次へ進むのは動画が終わった時だけなので、画像で勝手に進むことはない。

文字はすべてテキストとして表示する(HTMLとしては解釈しない)。
