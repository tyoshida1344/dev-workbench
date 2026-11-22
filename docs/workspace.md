# 作業フォルダ(設計・テストケース・エビデンスの置き場)

設計・テストケース・エビデンスは、**開発しているリポジトリにも、このリポジトリにも置かない。**
Googleドライブに置き、ビューアでURLを指して読む。

## 置き場

1つのイシュー(または1つのテーマ)につき、Driveに1つのフォルダを作る。これを**作業フォルダ**と呼ぶ。

```
<作業の置き場>/                       環境変数 DEV_WORKBENCH_DOCS が指すフォルダ
  <リポジトリ名>/
    <イシュー番号>/                   作業フォルダ。番号の無いテーマは英小文字とハイフンの名前
      index.md                       イシューの概要とリンク
      QA.md                          未決(ある間だけ)
      spec.md                        最終仕様
      acceptance.md                  受け入れ基準
      impl.md                        実装の方針・計画
      test.md                        テストの方針・計画
      search/  spec/  impl/  test/   話題ごとの下書き(NN_<slug>.md)
      images/                        画面イメージ(spec.md などから相対パスで埋め込む)
      cases/                         テストケースの下書き(種別ごとのJSON)
      evidence/
        <YYYY-MM-DD>-<内容>/         1回のテスト。manifest.json と動画・画像・テキスト
```

- 設計の Markdown の決まりは [design-folder.md](./design-folder.md)
- テストケースとエビデンスは、どちらも `manifest.json`([evidence-manifest.md](./evidence-manifest.md))。
  テストケースを作った時点では `result` の無い(未実施の)項目で、テストを行うと結果と動画・画像が付く
- 同じイシューを作り直す時は、元を残して `<イシュー番号>_2` を作る

## Driveへの置き方

Claude Code が書いたファイルをそのままDriveに載せるため、[Google ドライブ パソコン版](https://www.google.com/drive/download/) の同期フォルダの中を `DEV_WORKBENCH_DOCS` にする。
スキルは手元のファイルとして書き、同期がDriveへ上げる。DriveのAPIやコネクタでファイルの中身を送らない(大きなファイルで多くのトークンを使う)。

```
DEV_WORKBENCH_DOCS = G:\マイドライブ\dev-docs         (Windows の例)
DEV_WORKBENCH_DOCS = ~/Google Drive/My Drive/dev-docs  (macOS の例)
```

見せる相手は、`<作業の置き場>` かリポジトリのフォルダの共有設定で決める。作業フォルダごとに「リンクを知っている全員」の共有を足さない。

## ビューアで開く

DriveのフォルダのURL `https://drive.google.com/drive/folders/<ID>` の `<ID>` を使う。

| 見るもの | URL |
|---|---|
| 設計 | `<サイト>/design/?folder=<作業フォルダのID>` |
| テストケース・エビデンス | `<サイト>/evidence/?folder=<evidence の下の1回分のフォルダのID>` |

設計のビューアは、作業フォルダの `evidence/` の下にあるフォルダを一覧に出し、そこからエビデンスビューアへ移れる。
`<サイト>` は [README.md](../README.md) の先頭の1行。スキルからは `skills/config.json` の `site` を使う。
