#!/usr/bin/env bash
# このリポジトリのスキル(skills/)とサブエージェント(agents/)を ~/.claude にリンクし、どのプロジェクトからも使えるようにする。
# リンクなので、中身はこのリポジトリのまま(git pull すれば新しくなる)。Windows では link-global.ps1 を使う。
set -euo pipefail

home="$(cd "$(dirname "$0")/.." && pwd)"
dest="${CLAUDE_HOME:-$HOME/.claude}"
mkdir -p "$dest/skills" "$dest/agents"

for s in "$home"/skills/*/; do
  s="${s%/}"
  ln -sfn "$s" "$dest/skills/$(basename "$s")"
  echo "skills/$(basename "$s")"
done
for f in "$home"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sfn "$f" "$dest/agents/$(basename "$f")"
  echo "agents/$(basename "$f")"
done

echo
echo "リンクしました: $dest"
echo "~/.claude/settings.json に次を設定してください(どのプロジェクトから呼んでも効くように、ユーザーの設定に置く):"
echo "  env.DEV_WORKBENCH_HOME = \"$home\""
echo "  env.DEV_WORKBENCH_DOCS = \"<Google ドライブ パソコン版の同期フォルダの中の、作業の置き場>\""
echo "  permissions.additionalDirectories に、上の2つのパスを足す"
