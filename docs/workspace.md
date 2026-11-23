# 作業フォルダ(設計・テストケース・エビデンスの置き場)

設計・テストケース・エビデンスは、**開発しているリポジトリにも、このリポジトリにも置かない。**
手元に書いて Googleドライブに置き、ビューアでURLを指して読む。

**スキルが作業フォルダとビューアのURLを決める時は、この文書だけに従う。** 各スキルには、ここに書いたことを書き直さない。

## 置き場

1つのイシュー(または1つのテーマ)につき、手元に1つのフォルダを作り、Driveにも同じ形で置く(下の「Driveへの置き方」)。これを**作業フォルダ**と呼ぶ。

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

- 設計の Markdown の決まりは [design-folder.md](/docs/design-folder.md)
- テストケースとエビデンスは、どちらも `manifest.json`([evidence-manifest.md](/docs/evidence-manifest.md))。
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
| `DEV_WORKBENCH_DOCS` | 手元の作業の置き場。スキルはここに書く。同期を使う PC は Google ドライブ パソコン版の同期フォルダの中、使わない PC は手元の好きなフォルダ |
| `DEV_WORKBENCH_DRIVE_FOLDER` | (任意)Drive の基準フォルダの ID。**あれば、Claude in Chrome で Drive に上げる。無ければ、同期に任せる**(下の「Driveへの置き方」)。同期フォルダの中を `DEV_WORKBENCH_DOCS` にした PC では書かない(二重に上がる) |

- ユーザーの設定(`~/.claude/settings.json` の `env`)に置く。手順は [README.md](/README.md) の「使い始める」
- 使う前に `echo "$DEV_WORKBENCH_DOCS" "$DEV_WORKBENCH_DRIVE_FOLDER"` で確かめる。**`DEV_WORKBENCH_DOCS` が空なら止めて、ユーザーに場所を聞く。** 推し量って作らない。リポジトリの中や、ほかの場所に代わりに作らない

```
DEV_WORKBENCH_DOCS = G:\マイドライブ\dev-docs         (Windows で同期を使う例)
DEV_WORKBENCH_DOCS = ~/Google Drive/My Drive/dev-docs  (macOS で同期を使う例)
DEV_WORKBENCH_DOCS = C:\Users\<名前>\dev-docs          (同期を使わず、Chrome で上げる例)
DEV_WORKBENCH_DRIVE_FOLDER = 12iXVido-...              (Chrome で上げる時の基準フォルダの ID)
```

## dev-workbench の場所

スキル・`docs/`・`scripts/`・`.claude/skills/config.json` は、dev-workbench の中から読む。その場所を `<dev-workbench>` と書く。

- 入口の `SKILL.md` に、`${CLAUDE_SKILL_DIR}/../../..` として書いてある。Claude Code がスキルを読み込む時に、そのスキルのフォルダの絶対パスに置き換える。プラグインとして入れた時はその写し(`~/.claude/plugins/` の下)、このリポジトリの中ではこのリポジトリを指す
- 中の手順・`docs/`・コマンドの中の `<dev-workbench>` は、入口で分かった絶対パスに置き換えて使う(中の手順は Read で読むので、`${...}` は置き換わらない)
- サブエージェントには、絶対パスにして渡す
- スキル・`docs/` の中の Markdown のリンクは `/` で始まる(`[docs/workspace.md](/docs/workspace.md)`)。この `/` は `<dev-workbench>` のことなので、`<dev-workbench>/docs/workspace.md` を読む
- プラグインとして入れた時は、スキルとサブエージェントの名前の前に `dev-workbench:` が付く。手順の中で `review`・`test-run`・`test-cases-unit` などと書いた名前は、`dev-workbench:review` のように付けて呼ぶ(このリポジトリの中で、プロジェクトのスキルとして読まれた時のスキルは付けない)

## Driveへの置き方

スキルは、いつも手元の作業フォルダ(`$DEV_WORKBENCH_DOCS/<リポジトリ名>/<イシュー番号>/`)にファイルとして書く。Drive へは、次のどちらかで置く。

| PC | 置き方 |
|---|---|
| `DEV_WORKBENCH_DRIVE_FOLDER` が無い | 同期に任せる。`DEV_WORKBENCH_DOCS` が同期フォルダの中なので、書けば同期が Drive へ上げる |
| `DEV_WORKBENCH_DRIVE_FOLDER` がある | Claude in Chrome で上げる(下の「Chrome で上げる」) |

- Drive の側も手元と同じ形にする: `<基準フォルダ>/<リポジトリ名>/<イシュー番号>/…`(`evidence/<YYYY-MM-DD>-<内容>/`・`search/` などの下のフォルダも同じ名前)。同期の時は、`DEV_WORKBENCH_DOCS` が基準フォルダにあたる
- DriveのAPIやコネクタでファイルの中身を送らない(大きなファイルで多くのトークンを使う)
- Drive から手元へは読み戻さない。1つのイシューは1台の PC で進める
- 見せる相手は、基準フォルダかリポジトリのフォルダの共有設定で決める。作業フォルダごとに「リンクを知っている全員」の共有を足さない
- **ビューアのURLを渡す前に、Drive のフォルダにファイルが揃ったことを確かめる**(同期なら同期が終わったこと、Chrome ならその区切りの分を上げ終えたこと)

### Chrome で上げる

- **上げる時機**: 区切りごと。ビューアのURLを渡す前と、その作業(設計のフェーズ・テストケース作り・テストの実施)を終える前。書くたびには上げない
- **上げるもの**: その区切りで書いた・変えたファイルを含むフォルダの中身(例: テストの1回分なら `evidence/<YYYY-MM-DD>-<内容>/` のファイルすべて)
- **Claude in Chrome が使えない時は止めて、ユーザーに聞く。** コネクタやほかの方法で代わりに上げない

手順(使う道具は Claude in Chrome の `navigate`・`computer`・`find`・`javascript_tool`・`file_upload`):

1. 新しいタブで `https://drive.google.com/drive/folders/<ID>` を開く(`<ID>` は、上の `echo` で得た `DEV_WORKBENCH_DRIVE_FOLDER` の値。URL の欄では環境変数は展開されない)。ログインの画面になったら、ユーザーにログインを頼んで待つ
2. `<リポジトリ名>` → `<イシュー番号>` → その下のフォルダの順に、ダブルクリックで開いていく。無いフォルダは「新規」→「新しいフォルダ」で、手元と同じ名前で作ってから開く
3. 上げる先のフォルダを開いたら、ファイルを渡す(Drive の「ファイルのアップロード」は OS のファイル選択の画面を開き、操作できないので使わない)
   - `javascript_tool` で、ページに一時的な入力を足す: `<input type="file" multiple id="cw-up">`
   - `find` でその入力(`file-input`)の ref を取り、`file_upload` に ref と手元のファイルの絶対パスを渡す(1回に 10MB 未満。超える時は何回かに分ける)
   - `javascript_tool` で、入力の files を `DataTransfer` に入れ、フォルダの一覧の場所(フォルダが空なら「Drop files here」の領域、ファイルがあれば一覧の行のある所。`document.elementFromPoint` で画面の中ほどの要素を取ってよい)に `dragenter`・`dragover`・`drop` を送る。送ったら、足した入力を消し、`document` に `dragleave` を送る(送らないと「ここにドロップ」の表示が残る)
4. 同じ名前のファイルがあると「アップロード オプション」(Upload options)が出る。**置き換える**(「既存のアイテムを置き換える」/ Replace existing items。初めから選ばれている)のまま「アップロード」を押す。前の中身は Drive の版の履歴に残る。別のファイルとして残すと、ビューアが古い方を読むことがある
5. 「アップロード完了」の件数と、一覧のファイル名が手元と揃っていることを確かめる。揃わない・失敗と出た時は、同じ操作を繰り返さず、止めてユーザーに聞く
6. 上げるフォルダがいくつもある時(設計の直下の文書と `spec/`・`images/` など)は、フォルダごとに 2〜5 を繰り返す
7. フォルダの ID は、開いているフォルダの URL(`…/folders/<ID>`)から取る
8. 開いたタブを閉じる

## ビューアで開く

| 見るもの | URL |
|---|---|
| 設計 | `<site>design/?folder=<作業フォルダのID>` |
| テストケース・エビデンス | `<site>evidence/?folder=<evidence の下の1回分のフォルダのID>` |

- URL を作る前に、上の「Driveへの置き方」で Drive に揃える
- `<site>` は `<dev-workbench>/.claude/skills/config.json` の `site`(末尾は `/`)。読めなければユーザーに聞く。人に向けた説明では [README.md](/README.md) の先頭の1行が公開先
- `<ID>` は、DriveのフォルダのURL `https://drive.google.com/drive/folders/<ID>` の `<ID>`。Chrome で上げた時は、そのフォルダの URL から取る。同期の時は、Drive のコネクタがあればフォルダの名前で探し、親フォルダ(`<リポジトリ名>` など)も合っていることを確かめて取る。無ければユーザーにフォルダのURLを聞く
- 設計のビューアは、作業フォルダの `evidence/` の下にあるフォルダを一覧に出し、そこからエビデンスビューアへ移れる
