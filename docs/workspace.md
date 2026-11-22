# 作業フォルダ(設計・テストケース・エビデンスの置き場)

設計・テストケース・エビデンスは、**開発しているリポジトリにも、このリポジトリにも置かない。**
Googleドライブに置き、ビューアでURLを指して読む。

**スキルが作業フォルダとビューアのURLを決める時は、この文書だけに従う。** 各スキルには、ここに書いたことを書き直さない。

## 置き場

1つのイシュー(または1つのテーマ)につき、Driveに1つのフォルダを作る。これを**作業フォルダ**と呼ぶ。

```
$DEV_WORKBENCH_DOCS/                 作業の置き場(下の「環境変数」)
  <リポジトリ名>/
    <イシュー番号>/                   作業フォルダ
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

## 作業フォルダを決める

設計・テストケース・テストの実施が、同じイシューで同じフォルダを使えるよう、次の決め方にそろえる。

| 部分 | 決め方 |
|---|---|
| `<リポジトリ名>` | **イシューのあるリポジトリ**の名前(`owner/` は付けない)。イシューが今のリポジトリ(cwd)のものなら `gh repo view --json name -q .name`。別のリポジトリのイシュー(`gh issue view <番号> -R <owner>/<name>` で読んだもの)なら、その `<name>`。イシューの無い作業(PR だけ、テーマ)は cwd のリポジトリ |
| `<イシュー番号>` | イシューの番号。ユーザーの指示・ブランチ名(`issues/<番号>` など)・PR やイシューの URL から取る。**分からなければ推し量らずに聞く**。イシューの無い作業は、英小文字とハイフンの名前(例: `load-config-options`) |
| 作り直す時 | 元を残して `<イシュー番号>_2`、`_3`… を新しく作る(元は書き換えない)。どこまで作り直すか(全体か、一部の再テストか)はユーザーに聞く |

決めた作業フォルダの絶対パスを、サブエージェントにはそのまま渡す(サブエージェントは環境変数を読めないことがある)。

## 環境変数

| 環境変数 | 中身 |
|---|---|
| `DEV_WORKBENCH_DOCS` | 作業の置き場。Google ドライブ パソコン版の同期フォルダの中 |
| `DEV_WORKBENCH_HOME` | dev-workbench を手元に置いた場所。スキル・`docs/`・`scripts/`・`skills/config.json` を読む |

- どちらもユーザーの設定(`~/.claude/settings.json` の `env`)に置く。手順は [README.md](../README.md) の「使い始める」
- 使う前に `echo "$DEV_WORKBENCH_DOCS" "$DEV_WORKBENCH_HOME"` で確かめる。**空なら止めて、ユーザーに場所を聞く。** 推し量って作らない。リポジトリの中や、ほかの場所に代わりに作らない

```
DEV_WORKBENCH_DOCS = G:\マイドライブ\dev-docs         (Windows の例)
DEV_WORKBENCH_DOCS = ~/Google Drive/My Drive/dev-docs  (macOS の例)
```

## Driveへの置き方

[Google ドライブ パソコン版](https://www.google.com/drive/download/) の同期フォルダの中に書けば、同期がDriveへ上げる。

- スキルは手元のファイルとして書く。DriveのAPIやコネクタでファイルの中身を送らない(大きなファイルで多くのトークンを使う)
- 見せる相手は、`$DEV_WORKBENCH_DOCS` かリポジトリのフォルダの共有設定で決める。作業フォルダごとに「リンクを知っている全員」の共有を足さない
- URLを渡す前に、同期が終わったこと(Driveのフォルダにファイルが揃ったこと)を確かめる

## ビューアで開く

| 見るもの | URL |
|---|---|
| 設計 | `<site>design/?folder=<作業フォルダのID>` |
| テストケース・エビデンス | `<site>evidence/?folder=<evidence の下の1回分のフォルダのID>` |

- `<site>` は `$DEV_WORKBENCH_HOME/skills/config.json` の `site`(末尾は `/`)。読めなければユーザーに聞く。人に向けた説明では [README.md](../README.md) の先頭の1行が公開先
- `<ID>` は、DriveのフォルダのURL `https://drive.google.com/drive/folders/<ID>` の `<ID>`。Drive のコネクタがあれば、フォルダの名前で探し、親フォルダ(`<リポジトリ名>` など)も合っていることを確かめて取る。無ければユーザーにフォルダのURLを聞く
- 設計のビューアは、作業フォルダの `evidence/` の下にあるフォルダを一覧に出し、そこからエビデンスビューアへ移れる
