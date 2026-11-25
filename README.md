# dev-workbench

開発で使う道具の置き場。GitHub Pagesで公開している: <https://tyoshida1344.github.io/dev-workbench/>

以下ではこの公開先を `<サイト>` と書く(公開先を書くのはこの1行だけにして、ほかは相対で指す)。

**このリポジトリにはデータを置かない。** 公開リポジトリで、Pagesのサイトも誰でも見られるため。
道具はプログラムだけを持ち、動画や仕様などのデータはDriveなどに置いたものをURLで指して開く。

## 道具

| 道具 | 場所 | 使い方 |
|---|---|---|
| 設計ビューア | [`app/design/`](/app/design/) | イシューごとの設計(Markdown)を、文書の一覧から読む |
| エビデンスビューア | [`app/evidence/`](/app/evidence/) | テストケースと受入確認の動画・画像を、項目の一覧から見て回る。行に「動画」「画像」の札が出て、押すとその場に出る(動画は連続再生もできる)。見てほしい項目の ★、正常系・異常系・境界の札、一連の動作(流れ)の括りも出る |

設計・テストケース・エビデンスは、イシューごとにDriveの1つのフォルダ(作業フォルダ)にまとめて置く。置き方は [docs/workspace.md](/docs/workspace.md)。

### サイトの作り

公開するのは `app/`(画面)と `sample/`(見本)だけ。ビルドはせず、[.github/workflows/pages.yml](/.github/workflows/pages.yml) が `app/` をサイトの直下に、`sample/` を `/sample/` に写して公開する。
`app/` の中は、フォルダの場所がそのまま URL になる(Next.js の `app/` と同じ考え方)。`_` で始まるフォルダは画面ではない部品。

```
app/
  index.html        → <サイト>/            道具の一覧
  design/           → <サイト>/design/     設計ビューア
  evidence/         → <サイト>/evidence/   エビデンスビューア
  _lib/             (画面ではない、共通の部品)
  config.js
sample/
  design/           → <サイト>/sample/design/     設計ビューアの見本
  evidence/         → <サイト>/sample/evidence/   エビデンスビューアの見本
```

### ログイン(どの道具も同じ)

1. Driveのフォルダを開くと、Googleでのログインを求められる。「Googleでログインして開く」を押すとGoogleのログインの窓が開き、ログインすると窓が閉じて、そのページのまま読み込む。フォルダを見られるアカウントでログインする
2. 1つの道具でログインすれば、同じタブのほかの道具でもそのまま読める

- 読めるのは、ログインした人がもともとDriveで見られるファイルだけ。見られる人はフォルダの共有設定で決まる
- ログインの窓はボタンを押した時にだけ開く(押していない時に開く窓は、ブラウザに止められる)。そのため、新しいタブで開くたびと、トークンの期限(Googleが決める。1時間ほど)が過ぎるたびに、1回押す。窓が開かない時は、このサイトのポップアップを許可する
- Driveのフォルダを開いた時は、Googleのログインの部品(`https://accounts.google.com/gsi/client`)をページに読み込む。部品はページの中で動き、ログインの窓を開く。受け取ったトークンは、GoogleとDriveにだけ渡る。見本と道具の一覧では、部品を読み込まない
- 受け取ったトークンは、期限までタブの中(`sessionStorage`)に置く。その間は読み直してもログインは要らない。トークンはURLにも履歴にも付かない
- トークンを置く場所はサイトの生成元(`https://<ユーザー>.github.io`)ごとなので、同じユーザーのほかのリポジトリの Pages からも、同じタブなら読める。自分のリポジトリだけなので害は小さいが、知らない Pages を同じタブで開かない
- 見ている途中で期限が過ぎると、次の項目を開いた時に、中身の上に「ログインの期限が切れました。」と「Googleでログインし直す」が出る。押して窓でログインすると、ページを移らずに、見ていたところのまま続けて読める
- 違うアカウントでログインして「…見つかりません。…このGoogleアカウントで見られるフォルダかを確かめてください」と出たら、タブを閉じて新しいタブで開き直し、ログインし直す。この時の窓では、アカウントを選ぶ画面が出る(同じタブで開き直しても、トークンが残っているので同じアカウントのまま)

### 設計ビューア

```
<サイト>/design/?folder=<作業フォルダのID>
```

どう見えるかは [`sample/design/`](/sample/design/) の見本で確かめられる(Driveもログインも要らない)。
ビューアを `?folder=sample` で開く。

- 作業フォルダの `index.md`・`spec.md` などを、設計を進める順に呼び名で並べ、`search/` などの下書きをその下に並べる
- 文書の中の相対リンク・画像はビューアの中で開く。HTMLは書いても文字のまま出る
- 作業フォルダの `evidence/` の下のフォルダは「テスト・エビデンス」として並び、押すとエビデンスビューアで開く
- 決まりは [docs/design-folder.md](/docs/design-folder.md)

### エビデンスビューア

```
<サイト>/evidence/?folder=<DriveのフォルダID>
```

どう見えるかは [`sample/evidence/`](/sample/evidence/) の見本で確かめられる(Driveもログインも要らない)。
ビューアを `?folder=sample` で開く。

- フォルダの `manifest.json` を読み、項目の一覧とプレーヤーが出る
- テストケースも同じ `manifest.json` に、結果の無い(未実施の)項目として書く。押すと前提・手順・期待する結果が出る。テストを行うと、同じ項目に結果と動画・画像が付く
- テストケースから作った受け入れの項目には ★(見てほしい)が付き、正常系・異常系・境界の札と、続けて行う項目の流れの括りも出せる
- `manifest.json` の形は [docs/evidence-manifest.md](/docs/evidence-manifest.md)。書いたものの見本は [`sample/evidence/`](/sample/evidence/)

手元で見る時は `node scripts/serve.mjs` で、公開と同じ形(`app/` を直下に、`sample/` を `/sample/` に)で `http://localhost:8126/` に配る。

## 準備(初回だけ)

GitHub の Settings → Pages の **Source** を「**GitHub Actions**」にする(`main` に入ると、ワークフローが `app/` と `sample/` を公開する)。

Driveを読むために、GoogleのOAuthクライアントIDが要る。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選ぶ(無ければ作る)
2. 「APIとサービス」→「ライブラリ」で **Google Drive API** を有効にする
3. 「OAuth 同意画面」を設定する
   - 個人のGoogleアカウントで使う: User Type は **外部**、公開ステータスは **テスト** のまま。使う人を **テストユーザー** に追加する(100人まで)
   - Google Workspace の組織の中だけで使う: User Type は **内部**(審査なしで、組織の人だけが使える)
   - スコープに `https://www.googleapis.com/auth/drive.readonly` を足す
4. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。種類は **ウェブ アプリケーション**
   - 「承認済みの JavaScript 生成元」に、公開先の生成元(`<サイト>` のうち `https://ホスト名` まで)を登録する
   - 「承認済みのリダイレクト URI」は使わない(ログインは窓で行い、ページは移らない)。前の版で登録した `<サイト>/auth/` などは、残っていても害は無い
   - 手元で確かめるなら、生成元に `http://localhost:8126` も足す(`scripts/serve.mjs` で配った時)。登録していない生成元では、窓の中にGoogleのエラーが出て、ログインできない
5. 発行されたクライアントIDを [`app/config.js`](/app/config.js) の `googleClientId` に書く

`drive.readonly` はGoogleが「制限付き」に分類しているスコープで、誰でも使えるよう本番に公開するにはGoogleの審査が要る。
テストのまま(または内部)で使う。

## 他のプロジェクトから使う

開発をしているプロジェクトの Claude Code から、イシュー対応・設計・テストケース作成・テストの実施・レビューをスキルとして使える。
書いたものは開発しているリポジトリにも、このリポジトリにも置かず、Driveの作業フォルダ([docs/workspace.md](/docs/workspace.md))に置いてビューアで見る。

ユーザーが呼ぶスキルは次の5つ。細かい使い分け(レビュー・やり直し・受入確認のまとめなど)は、各スキルの `SKILL.md` の「振り分け」が、頼まれたことに合わせて中の手順へ回す。

| 呼ぶスキル | 何をする | 中の手順(`.claude/skills/` からの場所) |
|---|---|---|
| `/issue-handler` | イシュー番号から、不明点の確認 → 確定した仕様のコメント → 実装 → 検証 → セルフレビュー → コミット → 受入確認のエビデンス → PR までを通して行う。大きなイシューは `/design` の流れに切り替える | — |
| `/design` | イシューの設計を、要件・影響範囲・今の振る舞い・変更仕様・未決・最終仕様・受け入れ基準・実装の計画・テストの計画の順に書く。小さい変更は、フェーズを3つの段にまとめたライト版で書く。設計ビューアで読む | フェーズごとの手順 `design/reference/`、ライト版 `design/reference/light.md`、ひな形 `design/templates/`、設計のレビュー `design/review/` |
| `/test-cases` | 変更から、単体・結合・回帰・受け入れのケースを並行に書き、漏れを見直して、未実施の項目の `manifest.json` にする。設計の受け入れ基準があれば、受け入れのケースはそこから作る。エビデンスビューアで読む | 形とコマンド `test-cases/reference/format.md`・項目の書き方 `writing.md`・観点 `perspectives.md`、テストケースのレビュー `test-cases/review/`、サブエージェント5つ(リポジトリの直下の [`agents/`](/agents/)) |
| `/test-run` | ケースを行い、結果と動画・画像を同じ `manifest.json` に足す | やり直し `test-run/retest/`、テストケースを作らない PR の受入確認のまとめ `test-run/evidence/`、撮り方のこつ `test-run/reference/capture.md` |
| `/review` | 実装を、観点ごとのチェックリストの形で指摘する。単体では報告だけで、頼まれた時は直すところまで | 実装 `review/impl/`・性能とコード量 `review/perf/`・回帰 `review/regression/`・使い勝手 `review/ux/`(設計とテストケースのレビューは、それぞれ `/design`・`/test-cases` の中) |

中の手順も `SKILL.md` という名前だが、スキルとしての名前と説明(frontmatter)を持たないので、スキルの一覧には出ない。

### 使い始める(PCごとに1回)

スキルとサブエージェントは、このリポジトリを Claude Code のプラグイン(マーケットプレイスもプラグインも `dev-workbench`)として入れて使う。
入れたプラグインのスキルは `/dev-workbench:issue-handler` のように、名前の前に `dev-workbench:` が付く(サブエージェントも `dev-workbench:test-cases-unit` のように付く)。

1. 作業の置き場を決める。設計・テストケース・エビデンスは手元に書いて、Drive に同じ形で置く([docs/workspace.md](/docs/workspace.md) の「Driveへの置き方」)
   - [Google ドライブ パソコン版](https://www.google.com/drive/download/) を使う PC: 同期フォルダの中に作業の置き場を作る。同期が Drive へ上げる
   - 使わない PC: 手元の好きなフォルダを作業の置き場にし、Drive に基準フォルダを作る。スキルが区切りごとに Claude in Chrome で上げる
2. `~/.claude/settings.json`(ユーザーの設定)に、次を足す。`<owner>/<name>` は GitHub のこのリポジトリ

```json
{
  "env": {
    "DEV_WORKBENCH_DOCS": "<作業の置き場>",
    "DEV_WORKBENCH_DRIVE_FOLDER": "<Drive の基準フォルダの ID(パソコン版を使わない PC だけ)>"
  },
  "permissions": {
    "additionalDirectories": ["<作業の置き場>", "<ホーム>/.claude/plugins/cache/dev-workbench"]
  },
  "extraKnownMarketplaces": {
    "dev-workbench": {
      "source": { "source": "github", "repo": "<owner>/<name>" },
      "autoUpdate": true
    }
  }
}
```

- `additionalDirectories` の2つめは、入れたプラグインの写しの置き場。スキルが中の手順を読む時に、そのたびに許可を聞かれないようにする
- `DEV_WORKBENCH_DRIVE_FOLDER` は、Drive の基準フォルダの URL `https://drive.google.com/drive/folders/<ID>` の `<ID>`。パソコン版を使う PC では書かない
- `autoUpdate` で、Claude Code を起動した時に `main` の新しい版が入る

3. Claude Code で、プラグインを入れる

   ```
   /plugin install dev-workbench@dev-workbench
   ```

   - 「見つからない」と出た時だけ: 先に `/plugin marketplace add <owner>/<name>` でマーケットプレイスを足してから入れ直す

4. 入れた後、`settings.json` に `autoUpdate: true` が残っているかを見る(いつも行う)
   - マーケットプレイスを足す・入れる時に Claude Code が `extraKnownMarketplaces` を書き直し、`autoUpdate` が消えることがある
   - 消えていたら足し直す(`/plugin` のマーケットプレイスの画面で自動更新を入れてもよい)

#### スキルを直す時

- このリポジトリの中では、プラグインを入れていなくても `.claude/skills/` がプロジェクトのスキルとして使える(`/issue-handler` など。手元の、今のブランチの中身が効く)。サブエージェント([`agents/`](/agents/))はプラグインからしか読まれないので、入れたプラグインの版(`dev-workbench:test-cases-unit` など)が使われる
- `main` に入る前の変更を別のプロジェクトで試す時は、そのプロジェクトで `claude --plugin-dir <このリポジトリの場所>` と起動する(手元の中身をそのまま読み込む。直したら `/reload-plugins`)
- ほかのPCには、`main` に入れた後、それぞれで Claude Code を起動した時に入る

スキルはビューアのURLを [`.claude/skills/config.json`](/.claude/skills/config.json) の `site` から作る。公開先を移したら、ここを書き換える。

## 道具を足す時

- 1つの道具につき `app/` の下に1つのフォルダを作り(フォルダの名前が URL になる)、[app/index.html](/app/index.html) と上の表に足す。見本は `sample/<道具>/` に置く
- データは持たない。読む先はURLのパラメータで受け取る
- 共通の部品は [`app/_lib/`](/app/_lib/) にある。見た目(`style.css`)、要素の組み立て(`dom.js`)、Googleでのログインと Drive・URLからの読み込み(`drive.js`)、読む先の決め方とログインの案内(`page.js`)、Markdown の描画(`md.js`)。Google Cloud に登録するのはサイトの生成元だけなので、道具を足しても登録は変えなくてよい
- 読み込んだ文字は `textContent` で出す(`innerHTML` に入れない)
- コミットの前に `node scripts/check.mjs` を通す(Node 22 以上。`app/` の `.js` を ES モジュールとして調べるため)。画面は `node scripts/serve.mjs`(`.claude/launch.json` の `site`)で `http://localhost:8126/` に配って、見本で確かめる。開発の進め方(このリポジトリでもスキルを使う)は [CLAUDE.md](/CLAUDE.md)
