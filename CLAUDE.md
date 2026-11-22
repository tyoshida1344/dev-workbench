# CLAUDE.md

開発で使う道具の置き場。GitHub Pagesで公開する静的なサイト。概要と使い方は [README.md](./README.md)。

## 守ること

- **データをコミットしない。** 公開リポジトリで、Pagesのサイトも誰でも見られる。動画・スクリーンショット・仕様・テストの結果は、Driveなどに置いてURLで指す
  (例外は `evidence/sample/` と `design/sample/` の見本。開発のエビデンスや設計ではなく、ビューアを見てもらうために作った架空のもの)
- **秘密の値を置かない。** GoogleのOAuthクライアントIDは秘密ではないので `config.js` に置いてよい(許可する生成元をこのサイトに限って登録する)。クライアントシークレットやトークンは置かない
- **読み込んだ文字は `textContent` で出す。** 他人が作ったファイルを開かされても、ログインの情報を抜かれないようにする
- **サイトのURLを決め打ちしない。** 公開先を書くのは [README.md](./README.md) の先頭の1行だけ。
  リポジトリの中からは相対で指す(`evidence/?base=sample/` など)。外から指すもの(他のプロジェクトに写すスキルなど)は、URLを1か所にまとめて、写した先で書き換えられるようにする(スキルは `skills/config.json`)。公開先を移しても、forkされても動くように
- ビルドの手順を持たない。HTML・CSS・JavaScriptをそのまま置く(外部のスクリプトを読み込まない。Googleのログインも、ページごとGoogleへ移って戻ってくる形で行う)
- 見た目は道具の間でそろえる。共通の部品は `lib/` に置き、道具ごとに作り直さない(`lib/style.css` の見た目、`lib/dom.js` の要素の組み立て、`lib/drive.js` のログインと読み込み、`lib/page.js` の読む先の決め方、`lib/md.js` の Markdown の描画)
- スキルは `skills/<スキル>/SKILL.md` に置く。ユーザーが呼ぶのは `issue-handler`・`design`・`test-cases`・`test-run`・`review` だけで、細かい使い分けは各 `SKILL.md` の「振り分け」から、中の手順(入れ子のフォルダの `SKILL.md`。frontmatter を持たない)へ回す。サブエージェントは使うスキルの `agents/` に置く。`scripts/link-global.*` で `~/.claude` に同じ階層でリンクして使う。スキルが書く設計・テストケース・エビデンスは、開発しているリポジトリにもこのリポジトリにも置かず、Driveの作業フォルダ([docs/workspace.md](./docs/workspace.md))に置く

## スキルの書き方

- **1つの決まりは1か所にだけ書く。** ほかの所からは、その場所を指す1行にする(書き写すと、片方だけ直って食い違う)
  - 作業フォルダ・環境変数・ビューアのURL: [docs/workspace.md](./docs/workspace.md)
  - `manifest.json` の欄の意味: [docs/evidence-manifest.md](./docs/evidence-manifest.md)(検査は `scripts/check-manifest.mjs`)
  - 設計の Markdown の書き方: [docs/design-folder.md](./docs/design-folder.md)
  - レビューの進め方・重要度・出力の形: `skills/review/SKILL.md`
  - テストケースの形とコマンドの一覧: `skills/test-cases/reference/format.md`、項目の書き方: `writing.md`、観点: `perspectives.md`、サブエージェントの約束: `subagent.md`
  - 撮り方(画像か動画か・1項目に1つ): `skills/test-run/reference/capture.md`、エビデンスのファイル名: `skills/test-run/SKILL.md`
- **場所の書き方**: 文の中で手順やファイルを指す時は、`skills/` からの場所を `` ` `` で囲んで書く(`review/impl/`、`test-cases/reference/format.md`)。実行するコマンドの中は `$DEV_WORKBENCH_HOME/` から書く。Markdown のリンクだけは、そのファイルからの相対にする
- 入れ子の手順は、自分を「この手順」と呼ぶ(「このスキル」は入口の `SKILL.md` だけ)。冒頭の「読む時:」は、どの振り分けから来るかを1行で書く
- サブエージェントは親の会話を見られない。読む決まりは、サブエージェントのファイルに「先に読む」として全部挙げる

## 開発の進め方

このリポジトリの開発でも、ここで作っているスキルを使う(作った仕組みを、自分で使って確かめる)。

- **使えるようにする**: `scripts/link-global.*` で `~/.claude` にリンクする(README の「使い始める」)。リンクなので、ここでスキルを直すと、そのまま次の呼び出しから効く。`DEV_WORKBENCH_HOME` はこのリポジトリ、`DEV_WORKBENCH_DOCS` は Drive の作業の置き場
- **イシュー対応**: `issue-handler` で進める。作業フォルダは `$DEV_WORKBENCH_DOCS/dev-workbench/<イシュー番号>/`
- **大きな変更は設計から**: 新しい道具を足す、ログインや読み込みの仕組みを変える、`manifest.json` や作業フォルダの形を変える時は、`design` の流れで作業フォルダに設計を書いてから実装する
- **レビュー**: `review`(当てる観点は `review/SKILL.md` の「当てるレビュー」のとおり)。スキル・docs の文章だけの変更も、実装のレビューの「文書の更新」「コメントと文書の書き方」と回帰のレビュー(手順どうしの呼び名・参照のずれ)を当てる
- **検証**: `node scripts/check.mjs`(JavaScript の構文、JSON、`innerHTML` などの禁止、外のスクリプトの読み込み、見本の形とリンク、テストケースのひな形、スキルの frontmatter)。コミットの前に通す
- **画面で確かめる**: `.claude/launch.json` の `site`(リポジトリの直下を `http://localhost:8126/` で配る)で開き、見本(`design/?base=sample/`、`evidence/?base=sample/`)で見る。狭い幅(375px)と、暗い表示も見る。Drive から読むところは、Google Cloud に `http://localhost:8126/auth/` を登録していないとログインから戻れない
- **受入確認のエビデンス**: 見本の画面を撮って、作業フォルダの `evidence/` に置く(リポジトリには置かない)
- **見本も直す**: 形(`manifest.json`・設計の Markdown の決まり)や見た目を変えたら、見本も合わせて直す。見本は書き方の手本も兼ねている
