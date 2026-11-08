# dev-workbench

開発で使う道具の置き場。GitHub Pagesで公開している: <https://tyoshida1344.github.io/dev-workbench/>

以下ではこの公開先を `<サイト>` と書く(公開先を書くのはこの1行だけにして、ほかは相対で指す)。

**このリポジトリにはデータを置かない。** 公開リポジトリで、Pagesのサイトも誰でも見られるため。
道具はプログラムだけを持ち、動画や仕様などのデータはDriveなどに置いたものをURLで指して開く。

## 道具

| 道具 | 場所 | 使い方 |
|---|---|---|
| エビデンスビューア | [`evidence/`](./evidence/) | 受入確認の動画を、項目の一覧から見て回る。項目を押すとその動画を再生し、連続再生もできる |

### エビデンスビューア

```
<サイト>/evidence/?folder=<DriveのフォルダID>
```

どう見えるかは [`evidence/sample/`](./evidence/sample/) の見本で確かめられる(Driveもログインも要らない)。
ビューアを `?base=sample/` を付けて開く。

1. 開くと、Googleでログインを求められる。押すとGoogleのログイン画面へ移り、ログインするとビューアに戻ってくる。エビデンスのフォルダを見られるアカウントでログインする
2. フォルダの `manifest.json` を読み、項目の一覧とプレーヤーが出る

- 読めるのは、ログインした人がもともとDriveで見られるファイルだけ。見られる人はフォルダの共有設定で決まる
- ログインの情報は見ている人のブラウザの中にだけあり、どこにも送らない
- 受け取ったトークンは、期限(1時間)までタブの中(`sessionStorage`)に置く。その間は読み直してもログインは要らない
- 一度ログインできたら、次からは開いた時に画面を出さずにログインし直す(一瞬Googleへ移って戻る)。Googleからログアウトしている時などは、ボタンが出る
- 見ている途中で1時間が過ぎたら「ログインし直す」が出て、押すと見ていた項目に戻ってくる
- `manifest.json` の形は [docs/evidence-manifest.md](./docs/evidence-manifest.md)。書いたものの見本は [`evidence/sample/`](./evidence/sample/)

手元で確かめる時は、`manifest.json` と動画を置いたフォルダを簡易サーバーで配り、`?base=<そのURL>` で開く。

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
   - 「承認済みのリダイレクト URI」に `<サイト>/evidence/` を登録する(ログインのあと戻ってくる先。末尾の `/` まで同じにする)
   - 手元で確かめるなら、生成元に `http://localhost:<ポート>`、リダイレクトURIに `http://localhost:<ポート>/<パス>/evidence/` も足す
5. 発行されたクライアントIDを [`config.js`](./config.js) の `googleClientId` に書く

`drive.readonly` はGoogleが「制限付き」に分類しているスコープで、誰でも使えるよう本番に公開するにはGoogleの審査が要る。
テストのまま(または内部)で使う。

## 他のプロジェクトから使う

開発をしているプロジェクトのClaude Codeにスキルを置くと、受入確認のエビデンスをビューアで見られる形(動画・画像と `manifest.json`)にまとめるところまでを任せられる。

| スキル | 場所 | 何をする |
|---|---|---|
| evidence-pack | [`skills/evidence-pack/`](./skills/evidence-pack/) | エビデンスのフォルダを作り、`manifest.json` を書き、形を確かめて、Driveに上げたURLを渡すまで |

使うプロジェクトの `.claude/skills/` にフォルダごと写す。詳しくは [skills/evidence-pack/README.md](./skills/evidence-pack/README.md)。

## 道具を足す時

- 1つの道具につき1つのディレクトリを作り、トップの [index.html](./index.html) と上の表に足す
- データは持たない。読む先はURLのパラメータで受け取る
- 読み込んだ文字は `textContent` で出す(`innerHTML` に入れない)
