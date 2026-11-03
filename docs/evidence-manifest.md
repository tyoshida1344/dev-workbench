# エビデンスの manifest.json

エビデンスビューアが読むファイル。動画と同じDriveのフォルダに `manifest.json` という名前で置く。
ビューアはフォルダの中をファイル名で探すので、`video` や `file` にはファイル名だけを書く(パスは書かない)。

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
| `sections[].items[].result` | | `ok` / `partial` / `ng`。一覧に ○ / △ / × で出す |
| `sections[].items[].checks` | | 確かめたこと(1行ずつ) |
| `sections[].items[].note` | | 補足 |
| `sections[].items[].video` | | 動画のファイル名。無い項目は押せない |
| `attachments[]` | | 添付。`.webm` `.mp4` `.mov` はプレーヤーで、それ以外はテキストとして開く |

文字はすべてテキストとして表示する(HTMLとしては解釈しない)。
