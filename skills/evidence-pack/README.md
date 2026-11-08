# evidence-pack(サンプルSKILL)

他のプロジェクトで行った開発のエビデンスを、[エビデンスビューア](../../evidence/)で見られる形にまとめるためのスキル。
**このリポジトリでは使わない。** 開発をしているプロジェクトに写して使う。

見本: <https://tyoshida1344.github.io/dev-workbench/evidence/?base=sample/>(書き上がりがどう出るか)

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
| [templates/manifest.json](./templates/manifest.json) | 写して埋めるひな形 |
| [scripts/check-manifest.mjs](./scripts/check-manifest.mjs) | フォルダを確かめる(Nodeだけで動く。`node check-manifest.mjs <フォルダ>`) |

## 直して使う

写した先で、そのプロジェクトに合わせて書き換えてよい。よく直すところ:

- **撮り方**(SKILL.md の手順3)。Playwright の `video` / `screenshot` を使うなら、そのコマンドを書いておくと毎回同じ形になる
- **フォルダの置き場**(手順1)。プロジェクトで決まった場所があれば、そこに書き換える
- **渡し方**(手順7)。PRのコメントに貼る形が決まっていれば、その文面を書いておく

どのプロジェクトでも変えないのは、`manifest.json` の形(ビューアが読む決まり)と、
**エビデンスをリポジトリにコミットしない**こと。
