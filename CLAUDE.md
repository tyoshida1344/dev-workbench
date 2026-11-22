# CLAUDE.md

開発で使う道具の置き場。GitHub Pagesで公開する静的なサイト。概要と使い方は [README.md](./README.md)。

## 守ること

- **データをコミットしない。** 公開リポジトリで、Pagesのサイトも誰でも見られる。動画・スクリーンショット・仕様・テストの結果は、Driveなどに置いてURLで指す
  (例外は `evidence/sample/` と `design/sample/` の見本。開発のエビデンスや設計ではなく、ビューアを見てもらうために作った架空のもの)
- **秘密の値を置かない。** GoogleのOAuthクライアントIDは秘密ではないので `config.js` に置いてよい(許可する生成元をこのサイトに限って登録する)。クライアントシークレットやトークンは置かない
- **読み込んだ文字は `textContent` で出す。** 他人が作ったファイルを開かされても、ログインの情報を抜かれないようにする
- **サイトのURLを決め打ちしない。** 公開先を書くのは [README.md](./README.md) の先頭の1行だけ。
  リポジトリの中からは相対で指す(`evidence/?base=sample/` など)。外から指すもの(他のプロジェクトに写すスキルなど)は、URLを1か所にまとめて、写した先で書き換えられるようにする(`~/.claude` にリンクして使うスキルは `skills/config.json`、写して使う evidence-pack は自分の `config.json`)。公開先を移しても、forkされても動くように
- ビルドの手順を持たない。HTML・CSS・JavaScriptをそのまま置く(外部のスクリプトを読み込まない。Googleのログインも、ページごとGoogleへ移って戻ってくる形で行う)
- 見た目は道具の間でそろえる。共通の部品は `lib/` に置き、道具ごとに作り直さない(`lib/style.css` の見た目、`lib/drive.js` のログインと読み込み、`lib/md.js` の Markdown の描画)
- スキルは `skills/`、サブエージェントは `agents/` に置き、`scripts/link-global.*` で `~/.claude` にリンクして使う。スキルが書く設計・テストケース・エビデンスは、開発しているリポジトリにもこのリポジトリにも置かず、Driveの作業フォルダ([docs/workspace.md](./docs/workspace.md))に置く
