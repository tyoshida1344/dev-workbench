# テストケースの形(下書きと manifest.json)

テストケースは、エビデンスビューアが読む `manifest.json` に、`result` の無い(未実施の)項目として書く。
`manifest.json` の欄の意味は [docs/evidence-manifest.md](../../../../docs/evidence-manifest.md) が正本。
ここには、テストケースを作る時の下書きの形(どの欄に何を書けるか)と、正本を作るコマンドを書く。中身の書き方は [writing.md](writing.md)。

## 置き場

作業フォルダ([docs/workspace.md](../../../../docs/workspace.md))の中に置く。開発しているリポジトリにはコミットしない。

```
<作業フォルダ>/
  cases/                          下書き(証跡)。種別ごとに並行して書くので、ファイルを分ける
    plan.json                     見出し・出どころ・要件・全体の注意・確かめないこと・添付(親が書く)
    setup.json                    準備(kind: setup)
    unit.json                     単体(kind: unit)
    integration.json              結合(kind: integration)
    regression.json               回帰(kind: regression)
    acceptance.json               受け入れ(kind: acceptance)
    cleanup.json                  後始末(kind: cleanup)
    order.json                    実施の順(手で書く。無ければ種別の順に並ぶ)
    00-cases.md                   どこから拾ったかと項目の対応表(plan.json の attachments で正本に添える)
    manifest.json                 証跡を見るための生成物(build-manifest.mjs --trail)
  evidence/
    <YYYY-MM-DD>-<内容>/          1回のテスト
      manifest.json               正本(build-manifest.mjs --out)。テストを行うと結果と動画・画像が足される
```

- 種別のファイルは、項目の無い種別なら作らない(`plan.json` の `notes` に「単体: 該当なし(理由)」と残す)
- ひな形は [../templates/cases/](../templates/cases/)。フォルダごと写して使う
- `cases/` の中の下書きは、「なぜこの項目が無いか」を追える**証跡**。正本を作ったあとも消さない

## plan.json

| 項目 | 必須 | 中身 |
|---|---|---|
| `title` | ○ | ビューアの見出し。短い名詞句(例: `#123 一覧の並び替え`) |
| `source` | | `repository` / `pullRequest` / `commit` / `url`(`docs/evidence-manifest.md` と同じ)。イシューだけの時は `url` にイシューのURLを書く |
| `notes` | | 全体にかかる注意(配列)。変更の概要と確かめる条件を1〜2文、項目が無い種別の理由など。正本の `notes` の先頭に出る |
| `requirements` | 受け入れがあれば○ | 要件(`{ "id": "R1", "text": "…" }` の配列)。イシューと設計(spec.md・acceptance.md)に書かれたものだけ |
| `excluded` | | 確かめないこと(`{ "title", "reason" }` の配列)。**差分に含まれていないものだけ**。正本の `notes` に「確かめないこと: …」として出る |
| `attachments` | | 正本に添えるファイル(`{ "title", "file" }`)。`file` は `cases/` に置き、正本を作る時に evidence のフォルダへ写される |

## 00-cases.md(対応表)

項目を作ったら、どこから拾ったかと項目の対応を `cases/00-cases.md` に書き、`plan.json` の `attachments` で正本に添える(ひな形が添えてある)。ビューアで「何をもとに、何を確かめたか」を追えるようにするため。
テストケースを作らない受入確認(`test-run/evidence/`)でも、同じ形でエビデンスのフォルダに置く。

```markdown
# 項目の一覧(#123)

| 種別 | どこから | 項目 |
|---|---|---|
| 受け入れ | R1 最終行で Enter を押すと行が足される | tc04-01 |
| 結合 | 主な症状(変更した画面) | tc02-01 |
| 単体 | 差分の分岐(0件の時) | tc01-01 |
| 回帰 | list.js(一覧と検索の両方で使う) | tc03-01, tc03-02 |

## 行わない項目にしたもの
- tc02-02 → tc04-01(tc04-01 に「保存しました」の確かめを足した)

## 確かめないこと
- 差分が触れていない画面(わけ)
```

- 「種別」は、項目の種別(単体・結合・回帰・受け入れ)。テストケースを作らない受入確認では、3つの見方(要件・既存機能への影響・設計で追加した仕様。`test-cases/reference/perspectives.md`)を書く
- 「どこから」は、要件(`R1 …`)・観点の出どころ(`test-cases/reference/perspectives.md`)・変えた処理・決めたこと
- 1つの要件・1つの影響先・1つの決めたことに、行う項目が1つ以上あるようにする

## 種別ごとの下書き(`cases/<kind>.json`)

```json
{
  "sections": [
    {
      "id": "tc02",
      "title": "TC-02 主な症状の確認",
      "kind": "integration",
      "notes": ["何を見れば合否を判定できるか", "修正前の挙動: ○○になる"],
      "items": [
        {
          "id": "tc02-01",
          "title": "保存した名前が一覧に出ること",
          "priority": "high",
          "given": "一覧に1件ある",
          "steps": ["1行目の「名前」に `ひとつめ` を入れる", "「保存」を押す"],
          "expect": ["手順2: 一覧の1行目: `ひとつめ`", "手順2: トースト: `保存しました`"]
        }
      ]
    }
  ]
}
```

### 節(`sections[]`)

| 項目 | 必須 | 中身 |
|---|---|---|
| `id` | ○ | 英数字とハイフン(`tc02`、`setup`)。項目の `id` の頭になる。**ファイルをまたいで重ねない** |
| `title` | ○ | 観点が一目で分かる名前。テストの節は `TC-02 主な症状の確認` のように番号を頭に付ける |
| `kind` | ○ | ファイル名と同じ(`setup` / `unit` / `integration` / `regression` / `acceptance` / `cleanup`) |
| `notes` | | 節の説明(配列)。何を見れば合否を判定できるか、修正前の挙動(`修正前の挙動: …` と書く)など。正本では全体の `notes` に「節の title: …」として出る |
| `items` | ○ | 項目 |

### 項目(`items[]`)

| 項目 | 中身 |
|---|---|
| `id` | 節の `id` を頭にした番号(`tc02-01`、`setup-01`)。**ファイルをまたいで重ねない。決めたあとは変えない**(エビデンスのファイル名・再テストの対応に使う)。足す時は末尾に足す |
| `title` | **何を確かめる項目か**(確認内容)。1文。「何が正しいと言えれば合格か」を業務の言葉で書く(例:「休日の時間が、法定休日と所定休日で分かれて集計されること」)。操作や期待する結果の言い換えにしない。準備・後始末では「〜を用意する」「〜を元に戻した」 |
| `given` | 前提。満たしていないと結果が変わる状態。文字列で2行まで |
| `steps` | 操作の手順(文字列の配列。ビューアが番号を振る)。1つなら文字列でもよい |
| `expect` | 期待する結果(文字列の配列。確認することごとに分ける)。操作すれば必ずこうなる値。手順の後に見るものは頭に `手順N:` を付ける。準備・後始末では、できあがりの確認を1〜2行 |
| `basis` | 期待する結果の根拠(単体は必須、単体だけに付ける)。コードの `path:line` か、既存のテストの assert。**コードの言葉はここにだけ書ける** |
| `priority` | `high` / `mid` / `low`(テストの項目は必須) |
| `requirement` | 満たす要件の `id`(`R1`、または `["R1", "R2"]`)。**受け入れは必須、ほかの種別には付けない** |
| `noScreen` | 画面で確かめられない理由(結合・回帰・受け入れだけ)。手順にコマンドを置くなら必須([writing.md](writing.md)「画面ベースの原則」)。正本では `note` に「画面で確かめられない理由: …」として出る |
| `duplicateOf` | ほかの項目で確かめられるので行わない時、その項目の `id`。証跡では打ち消し線で出て、正本には入らない。行う側は、**階層が同じか上で、自身が `duplicateOf` を持たない項目**(`test-cases/SKILL.md` 5節) |

- 下書きには `result`・`checks`・`video`・`image` を書かない(結果は正本に書く)
- HTML は書けない(ビューアは文字としてそのまま出す)。強調や改行が要るなら、文や配列の要素に分ける
- 表を作りたくなったら、項目ごとに書くか、`notes` の1行ずつに分ける(参照用の表に準備の中身を散らさない)

## 実施の順(`cases/order.json`)

行う項目(`duplicateOf` を持たないもの)を、グループに分けて実施の順に並べる。準備と後始末は書かない(正本の最初と最後に自動で並ぶ)。

```json
{
  "groups": [
    {
      "id": "g01",
      "title": "一覧を見るだけの確かめ",
      "who": "閲覧だけのアカウント",
      "note": "続けて行う理由・始める前の注意を、画面の言葉で1〜3文",
      "cases": [
        "tc03-01",
        {
          "merge": ["tc02-01", "tc04-01"],
          "key": "save-name",
          "title": "保存した名前が一覧に出て、R1 を満たすこと",
          "given": "一覧に1件ある",
          "steps": ["1行目の「名前」に `ひとつめ` を入れる", "「保存」を押す"],
          "expect": ["手順2: 一覧の1行目: `ひとつめ`", "手順2: トースト: `保存しました`"]
        }
      ]
    },
    {
      "id": "g09",
      "title": "後始末のあとに確かめること",
      "afterCleanup": true,
      "cases": ["tc05-01"]
    }
  ]
}
```

| 項目 | 必須 | 中身 |
|---|---|---|
| `groups[].id` | ○ | 英数字とハイフン(`g01`)。正本の節の見出しの頭に大文字で出る(`G01 …`) |
| `groups[].title` | ○ | グループの名前 |
| `groups[].who` | | 使うアカウント・環境。見出しの後ろに `(…)` で出る |
| `groups[].note` | | 連続して行う理由・実施前の注意。正本では全体の `notes` に「見出し: …」として出る |
| `groups[].afterCleanup` | | `true` なら後始末のあとに並ぶ。`order.json` でも、ふつうのグループより後ろに置く |
| `groups[].cases[]` | ○ | 項目の `id` の文字列か、統合した項目 |

統合した項目(同じ人が同じ画面を続けて確かめられる項目を1つにまとめたもの):

| 項目 | 必須 | 中身 |
|---|---|---|
| `merge` | ○ | まとめる元の項目の `id`(1つ以上) |
| `title`・`steps`・`expect` | ○ | 書き方は下書きと同じ。**元の項目の確かめ(`expect`)を1つも落とさない** |
| `given`・`priority` | | `priority` を省くと、元の項目のうち一番高いもの |
| `id` | | 正本での `id`。省くと元の `id` を `+` でつないだもの(`tc02-01+tc04-01`) |
| `key` | | 英数字とハイフン。`order.json` の中で重ねない。後ろの統合した項目の本文から `@key` で指すと、その項目の `id` に置き換わる(「@save-name の続き」→「tc02-01+tc04-01 の続き」)。自分自身や後ろの項目は指せない |

- 行う項目は、**文字列か、1つ以上の統合した項目のどちらかに**入れる。文字列で2回書く・文字列と統合の両方に書く・1つの `merge` の中で重ねる・行わない項目を入れる、のはどれも止まる
- 元の項目が複数のアカウントにまたがる時は、アカウントごとの統合した項目に分け、同じ元の項目を複数の `merge` に入れてよい。元の確かめは、どれか1つの統合した項目に必ず書く
- 統合した項目の `requirement` は元の項目の和、`basis` は `元のid: 根拠` を並べたもの、`note` は「まとめた項目: …」になる

## 正本と証跡を作る

テストケースとエビデンスで使うコマンドの一覧。各手順はここを指し、その手順に固有の引数(やり直しの `--results-from` など)だけを手順に書く。

```
node "$DEV_WORKBENCH_HOME/.claude/skills/test-cases/scripts/check-cases.mjs" <作業フォルダ>
node "$DEV_WORKBENCH_HOME/.claude/skills/test-cases/scripts/check-cases.mjs" <作業フォルダ> --file <cases/unit.json のパス>
node "$DEV_WORKBENCH_HOME/.claude/skills/test-cases/scripts/check-cases.mjs" <作業フォルダ> --manifest <正本のフォルダ>
node "$DEV_WORKBENCH_HOME/.claude/skills/test-cases/scripts/build-manifest.mjs" <作業フォルダ> --trail --out <作業フォルダ>/evidence/<YYYY-MM-DD>-<内容>
node "$DEV_WORKBENCH_HOME/scripts/check-manifest.mjs" <エビデンスのフォルダ>
```

| コマンド | 見るもの・作るもの |
|---|---|
| `check-cases.mjs <作業フォルダ>` | 下書きの全部と `order.json`。形(`sections`・`kind` とファイル名・id の頭)・必須の欄・`priority` の値・コードの言葉と HTML・`【要確認】`・単体の `basis`・画面ベースの原則(`noScreen`)・要件ごとに受け入れの項目があるか・id の重なり・`duplicateOf` の先があり、行う項目で、階層が同じか上か・`order.json` の漏れと重なり・統合した項目の書き方と `@key`・正本が組み立てられ、要件をすべて確かめているか |
| `check-cases.mjs … --file <パス>` | その1ファイルだけ。種別ごとに並行して書いている間に使う。`--file` にはファイルの名前ではなく**パス**を渡す |
| `check-cases.mjs … --manifest <正本のフォルダ>` | あわせて、正本が今の下書きと合っているか(結果を書いた時に、項目の中身を変えていないか) |
| `build-manifest.mjs … --out <フォルダ>` | 正本。下の「正本で変わること」 |
| `build-manifest.mjs … --trail` | 証跡。下書きの全件を種別の順に並べ、`duplicateOf` の付いた項目も打ち消し線で残したもの。`cases/manifest.json` に書く。ビューアで `cases/` のフォルダを開くと見られる(重なりの判断をレビューする時に使う) |
| `check-manifest.mjs <フォルダ>` | `manifest.json` の形そのもの。ファイル名の綴り・拡張子・`summary` の数・使っていないファイル |

- 正本のフォルダに結果のある `manifest.json` があると、上書きしない(テストの結果を消さないため)。やり直しは [やり直し(`test-run/retest/`)](../../test-run/retest/SKILL.md) の手順で、新しいフォルダに作る
- 下書きを直したら、正本を作り直す(結果がまだ無い時)。そのあと `--manifest` で合っているかを確かめる

### 正本で変わること

- 節は、準備 → `order.json` のグループ(見出しは `G01 <title>(<who>)`)→ 後始末 → `afterCleanup` のグループ、の順になる。`order.json` が無ければ、準備 → 単体 → 結合 → 回帰 → 受け入れ → 後始末 の節の順。グループの項目の種別が1つなら、節にその `kind` が付く
- `duplicateOf` の付いた項目は入らない
- 項目の `id` は下書きのまま。統合した項目は、`order.json` で決めた `id`(無ければ元の id を `+` でつないだもの)になり、`note` に「まとめた項目: …」が付く
- 本文の中の、行わない項目の id は `duplicateOf` の先の id に、統合した項目に入った id は統合した項目の id に、書き換わる。`@key` は、その `key` を持つ前の統合した項目の id に置き換わる
- `plan.json` の `notes`・`excluded`、節の `notes`、グループの `note` は、正本の全体の `notes` にまとまる(`manifest.json` には節ごとの説明の欄が無いため)
- `noScreen` は、項目の `note` に「画面で確かめられない理由: …」として出る
- `plan.json` の `attachments`(`00-cases.md` など)は、正本のフォルダに写される
