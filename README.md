# dev-workbench

開発で使う道具の置き場。GitHub Pagesで公開している: <https://tyoshida1344.github.io/dev-workbench/>

以下ではこの公開先を `<サイト>` と書く(公開先を書くのはこの1行だけにして、ほかは相対で指す)。

**このリポジトリにはデータを置かない。** 公開リポジトリで、Pagesのサイトも誰でも見られるため。
道具はプログラムだけを持ち、動画や仕様などのデータはDriveなどに置いたものをURLで指して開く。

## 道具

| 道具 | 場所 | 使い方 |
|---|---|---|
| 設計ビューア | [`design/`](./design/) | イシューごとの設計(Markdown)を、文書の一覧から読む |
| エビデンスビューア | [`evidence/`](./evidence/) | テストケースと受入確認の動画・画像を、項目の一覧から見て回る。項目を押すとその動画を再生し、連続再生もできる |

設計・テストケース・エビデンスは、イシューごとにDriveの1つのフォルダ(作業フォルダ)にまとめて置く。置き方は [docs/workspace.md](./docs/workspace.md)。

### ログイン(どの道具も同じ)

1. Driveのフォルダを開くと、Googleでのログインを求められる。押すとGoogleのログイン画面へ移り、ログインすると開いていたページに戻ってくる。フォルダを見られるアカウントでログインする
2. 1つの道具でログインすれば、同じタブのほかの道具でもそのまま読める

- 読めるのは、ログインした人がもともとDriveで見られるファイルだけ。見られる人はフォルダの共有設定で決まる
- ログインの情報は見ている人のブラウザの中にだけあり、どこにも送らない
- 受け取ったトークンは、期限(1時間)までタブの中(`sessionStorage`)に置く。その間は読み直してもログインは要らない
- 一度ログインできたら、次からは開いた時に画面を出さずにログインし直す(一瞬Googleへ移って戻る)。Googleからログアウトしている時などは、ボタンが出る
- 見ている途中で1時間が過ぎたら「ログインし直す」が出て、押すと見ていたところに戻ってくる

### 設計ビューア

```
<サイト>/design/?folder=<作業フォルダのID>
```

どう見えるかは [`design/sample/`](./design/sample/) の見本で確かめられる(Driveもログインも要らない)。
ビューアを `?base=sample/` を付けて開く。

- 作業フォルダの `index.md`・`spec.md` などを、設計を進める順に呼び名で並べ、`search/` などの下書きをその下に並べる
- 文書の中の相対リンク・画像はビューアの中で開く。HTMLは書いても文字のまま出る
- 作業フォルダの `evidence/` の下のフォルダは「テスト・エビデンス」として並び、押すとエビデンスビューアで開く
- 決まりは [docs/design-folder.md](./docs/design-folder.md)

### エビデンスビューア

```
<サイト>/evidence/?folder=<DriveのフォルダID>
```

どう見えるかは [`evidence/sample/`](./evidence/sample/) の見本で確かめられる(Driveもログインも要らない)。
ビューアを `?base=sample/` を付けて開く。

- フォルダの `manifest.json` を読み、項目の一覧とプレーヤーが出る
- テストケースも同じ `manifest.json` に、結果の無い(未実施の)項目として書く。押すと前提・手順・期待する結果が出る。テストを行うと、同じ項目に結果と動画・画像が付く
- `manifest.json` の形は [docs/evidence-manifest.md](./docs/evidence-manifest.md)。書いたものの見本は [`evidence/sample/`](./evidence/sample/)

手元で確かめる時は、ファイルを置いたフォルダを簡易サーバーで配り、`?base=<そのURL>` で開く(設計ビューアも同じ)。

## 準備(初回だけ)

Driveを読むために、GoogleのOAuthクライアントIDが要る。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選ぶ(無ければ作る)
2. 「APIとサービス」→「ライブラリ」で **Google Drive API** を有効にする
3. 「OAuth 同意画面」を設定する
   - 個人のGoogleアカウントで使う: User Type は **外部**、公開ステータスは **テスト** のまま。使う人を **テストユーザー** に追加する(100人まで)
   - Google Workspace の組織の中だけで使う: User Type は **内部**(審査なしで、組織の人だけが使える)
   - スコープに `https://www.googleapis.com/auth/drive.readonly` を足す
4. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。種類は **ウェブ アプリケーション**
   - 「承認済みの JavaScript 生成元」に、公開先の生成元(`<サイト>` のうち `https://ホスト名` まで)を登録する
   - 「承認済みのリダイレクト URI」に `<サイト>/auth/` を登録する(ログインのあと戻ってくる先。どの道具からログインしても、ここに戻ってから元のページへ戻る。末尾の `/` まで同じにする)
   - 手元で確かめるなら、生成元に `http://localhost:<ポート>`、リダイレクトURIに `http://localhost:<ポート>/<パス>/auth/` も足す
5. 発行されたクライアントIDを [`config.js`](./config.js) の `googleClientId` に書く

`drive.readonly` はGoogleが「制限付き」に分類しているスコープで、誰でも使えるよう本番に公開するにはGoogleの審査が要る。
テストのまま(または内部)で使う。

## 他のプロジェクトから使う

開発をしているプロジェクトの Claude Code から、イシュー対応・設計・テストケース作成・テストの実施・レビューをスキルとして使える。
書いたものは開発しているリポジトリにも、このリポジトリにも置かず、Driveの作業フォルダ([docs/workspace.md](./docs/workspace.md))に置いてビューアで見る。

ユーザーが呼ぶスキルは次の5つ。細かい使い分け(レビュー・やり直し・受入確認のまとめなど)は、各スキルの `SKILL.md` の「振り分け」が、頼まれたことに合わせて中の手順へ回す。

| 呼ぶスキル | 何をする | 中の手順(`skills/` からの場所) |
|---|---|---|
| `/issue-handler` | イシュー番号から、不明点の確認 → 確定した仕様のコメント → 実装 → 検証 → セルフレビュー → コミット → 受入確認のエビデンス → PR までを通して行う。大きなイシューは `/design` の流れに切り替える | — |
| `/design` | イシューの設計を、要件・影響範囲・今の振る舞い・変更仕様・未決・最終仕様・受け入れ基準・実装の計画・テストの計画の順に書く。設計ビューアで読む | フェーズごとの手順 `design/reference/`、ひな形 `design/templates/`、設計のレビュー `design/review/` |
| `/test-cases` | 変更から、単体・結合・回帰・受け入れのケースを並行に書き、漏れを見直して、未実施の項目の `manifest.json` にする。エビデンスビューアで読む 形とコマンド `test-cases/reference/format.md`・項目の書き方 `writing.md`・観点 `perspectives.md`、テストケースのレビュー `test-cases/review/`、サブエージェント5つ `test-cases/agents/` |
| `/test-run` | ケースを行い、結果と動画・画像を同じ `manifest.json` に足す | やり直し `test-run/retest/`、テストケースを作らない PR の受入確認のまとめ `test-run/evidence/`、撮り方のこつ `test-run/reference/capture.md` |
| `/review` | 実装を、観点ごとのチェックリストの形で指摘する。単体では報告だけで、頼まれた時は直すところまで | 実装 `review/impl/`・性能とコード量 `review/perf/`・回帰 `review/regression/`・使い勝手 `review/ux/`(設計とテストケースのレビューは、それぞれ `/design`・`/test-cases` の中) |

中の手順も `SKILL.md` という名前だが、スキルとしての名前と説明(frontmatter)を持たないので、スキルの一覧には出ない。

### 使い始める(PCごとに1回)

1. このリポジトリを手元に clone する
2. スキルとサブエージェントを、このリポジトリと同じ階層で `~/.claude` にリンクする(`skills/<スキル>/` → `~/.claude/skills/<スキル>/`、`skills/<スキル>/agents/` → `~/.claude/agents/<スキル>/`。コピーではないので、`git pull` すれば新しくなる)。プロジェクトの `.claude/skills/` に同じ名前のスキル(`issue-handler`・`review` など)がある時は、そのプロジェクトではどちらも見える。プロジェクトの方を消すか、名前を変えて使い分ける

```
powershell -ExecutionPolicy Bypass -File scripts/link-global.ps1  # Windows(フォルダのリンクなので、管理者の権限は要らない)
bash scripts/link-global.sh      # macOS・Linux
```

3. [Google ドライブ パソコン版](https://www.google.com/drive/download/) を入れ、同期フォルダの中に作業の置き場を作る
4. `~/.claude/settings.json`(ユーザーの設定)に、次を足す

```json
{
  "env": {
    "DEV_WORKBENCH_HOME": "<このリポジトリの場所>",
    "DEV_WORKBENCH_DOCS": "<作業の置き場>"
  },
  "permissions": {
    "additionalDirectories": ["<このリポジトリの場所>", "<作業の置き場>"]
  }
}
```

スキルはビューアのURLを [`skills/config.json`](./skills/config.json) の `site` から作る。公開先を移したら、ここを書き換える。
プラグインとして配るかどうかは、イシューで検討している。

## 道具を足す時

- 1つの道具につき1つのディレクトリを作り、トップの [index.html](./index.html) と上の表に足す
- データは持たない。読む先はURLのパラメータで受け取る
- 共通の部品は [`lib/`](./lib/) にある。見た目(`style.css`)、要素の組み立て(`dom.js`)、Googleでのログインと Drive・URLからの読み込み(`drive.js`)、読む先の決め方とログインの案内(`page.js`)、Markdown の描画(`md.js`)。ログインの戻り先は `auth/` の1か所なので、道具を足してもGoogle Cloudの登録は変えなくてよい
- 読み込んだ文字は `textContent` で出す(`innerHTML` に入れない)
- コミットの前に `node scripts/check.mjs` を通す。画面は `.claude/launch.json` の設定で `http://localhost:8126/` に配って、見本で確かめる。開発の進め方(このリポジトリでもスキルを使う)は [CLAUDE.md](./CLAUDE.md)
