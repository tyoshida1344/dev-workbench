#!/usr/bin/env bash
# このリポジトリのスキルとサブエージェントを ~/.claude にリンクし、どのプロジェクトからも使えるようにする。
# リポジトリと同じ階層でリンクする:
#   skills/<まとまり>/          → ~/.claude/skills/<まとまり>/      (入れ子のスキルも、その中にそのまま入る)
#   skills/<まとまり>/agents/   → ~/.claude/agents/<まとまり>/      (Claude Code は agents/ をサブフォルダまで探す)
# リンクなので、中身はこのリポジトリのまま(git pull すれば新しくなる)。Windows では link-global.ps1 を使う。
# 前に作ったリンクのうち、このリポジトリを指しているのに先が無くなったものは消す。
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="${CLAUDE_HOME:-$HOME/.claude}"
mkdir -p "$dest/skills" "$dest/agents"

for link in "$dest"/skills/* "$dest"/agents/*; do
  [ -L "$link" ] || continue
  target="$(readlink "$link")"
  case "$target" in
    "$repo"/*) [ -e "$target" ] || { rm "$link"; echo "消した(先が無い): $link"; } ;;
  esac
done

for group in "$repo"/skills/*/; do
  group="${group%/}"
  name="$(basename "$group")"
  ln -sfn "$group" "$dest/skills/$name"
  echo "skills/$name"
  if [ -d "$group/agents" ]; then
    ln -sfn "$group/agents" "$dest/agents/$name"
    echo "agents/$name"
  fi
done

echo
echo "リンクしました: $dest"
echo "~/.claude/settings.json に次を設定してください(どのプロジェクトから呼んでも効くように、ユーザーの設定に置く):"
echo "  env.DEV_WORKBENCH_HOME = \"$repo\""
echo "  env.DEV_WORKBENCH_DOCS = \"<Google ドライブ パソコン版の同期フォルダの中の、作業の置き場>\""
echo "  permissions.additionalDirectories に、上の2つのパスを足す"
