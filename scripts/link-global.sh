#!/usr/bin/env bash
# このリポジトリのスキルとサブエージェントを ~/.claude にリンクし、どのプロジェクトからも使えるようにする。
# リポジトリと同じ階層でリンクする:
#   .claude/skills/<スキル>/    → ~/.claude/skills/<スキル>/    (中の手順も、その中にそのまま入る)
#   .claude/agents/<スキル>/    → ~/.claude/agents/<スキル>/    (Claude Code は agents/ をサブフォルダまで探す)
# このリポジトリの中では、リンクしなくてもプロジェクトのスキルとして使える。
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

# リンクを置く。同じ名前の、リンクでない本物のフォルダ・ファイルがあれば置き換えずに止める
# (ln -sfn は、置く先が本物のフォルダだと、その中にリンクを作ってしまうため)
link() {
  if [ -e "$2" ] && [ ! -L "$2" ]; then
    echo "リンクではないものがあるので、置き換えません: $2" >&2
    exit 1
  fi
  ln -sfn "$1" "$2"
}

for skill in "$repo"/.claude/skills/*/; do
  skill="${skill%/}"
  link "$skill" "$dest/skills/$(basename "$skill")"
  echo "skills/$(basename "$skill")"
done
for group in "$repo"/.claude/agents/*/; do
  [ -d "$group" ] || continue
  group="${group%/}"
  link "$group" "$dest/agents/$(basename "$group")"
  echo "agents/$(basename "$group")"
done

echo
echo "リンクしました: $dest"
echo "~/.claude/settings.json に次を設定してください(どのプロジェクトから呼んでも効くように、ユーザーの設定に置く):"
echo "  env.DEV_WORKBENCH_HOME = \"$repo\""
echo "  env.DEV_WORKBENCH_DOCS = \"<Google ドライブ パソコン版の同期フォルダの中の、作業の置き場>\""
echo "  permissions.additionalDirectories に、上の2つのパスを足す"
