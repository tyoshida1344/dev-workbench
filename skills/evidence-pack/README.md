# evidence-pack(サンプルSKILL)

他のプロジェクトで行った開発のエビデンスを、[エビデンスビューア](../../evidence/)で見られる形にまとめるためのスキル。
**このリポジトリでは使わない。** 開発をしているプロジェクトに写して使う。

見本は `<ビューア>?base=sample/` で開ける(書き上がりがどう出るか)。

## 置く

スキルを使うプロジェクトの `.claude/skills/` に、このフォルダごと写す。

```
cp -r <dev-workbenchの場所>/skills/evidence-pack <使うプロジェクト>/.claude/skills/
```

```
Copy-Item -Recurse <dev-workbenchの場所>\skills\evidence-pack <使うプロジェクト>\.claude\skills\
```

個人用として、どのプロジェクトからも使うなら `~/.claude/skills/` に置く。

## 中身

| ファイル | 何か |
|---|---|
| [SKILL.md](./SKILL.md) | 手順。フォルダを作る → 撮る → `manifest.json` を書く → 確かめる → Driveに上げてURLを渡す |
| [reference/manifest.md](./reference/manifest.md) | `manifest.json` の形。項目の一覧と例 |
| [reference/cases.md](./reference/cases.md) | 受け入れ項目の作り方。ゴール、要件・既存機能への影響・設計で追加した仕様の3つの見方、観点の出どころと技法、撮る前の見直し(自分と別の目) |
| [reference/capture.md](./reference/capture.md) | 撮り方のこつ。画面の大きさ・動画の始め方と止め方・日本語入力・端末の切り替えなど |
| [templates/manifest.json](./templates/manifest.json) | 写して埋めるひな形 |
| [scripts/check-manifest.mjs](./scripts/check-manifest.mjs) | フォルダを確かめる(Nodeだけで動く。`node check-manifest.mjs <フォルダ>`) |
| [config.json](./config.json) | ビューアのURL(`viewer`)。**写したら最初にここを書き換える。**スキルの中でURLを書くのはここだけ |

## 直して使う

写した先で、そのプロジェクトに合わせて書き換えてよい。よく直すところ:

- **ビューアのURL**(`config.json` の `viewer`)。ここだけは、写したら必ず見る
- **項目の作り方**(reference/cases.md)。影響を受けやすい共通の処理など、プロジェクトで必ず見る場所があれば書き足す
- **撮り方**(SKILL.md の手順3と reference/capture.md)。Playwright の `video` / `screenshot` を使うなら、そのコマンドを書いておくと毎回同じ形になる
- **フォルダの置き場**(手順1)。プロジェクトで決まった場所があれば、そこに書き換える
- **渡し方**(手順7)。PRのコメントに貼る形が決まっていれば、その文面を書いておく

どのプロジェクトでも変えないのは、`manifest.json` の形(ビューアが読む決まり)と、
**エビデンスをリポジトリにコミットしない**こと。
