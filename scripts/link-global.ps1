# このリポジトリのスキルとサブエージェントを ~/.claude にリンクし、どのプロジェクトからも使えるようにする。
# リポジトリと同じ階層でリンクする:
#   .claude/skills/<スキル>/    → ~/.claude/skills/<スキル>/    (中の手順も、その中にそのまま入る)
#   .claude/agents/<スキル>/    → ~/.claude/agents/<スキル>/    (Claude Code は agents/ をサブフォルダまで探す)
# このリポジトリの中では、リンクしなくてもプロジェクトのスキルとして使える。
# リンクなので、中身はこのリポジトリのまま(git pull すれば新しくなる)。フォルダのリンクはジャンクションで作るので、管理者の権限は要らない。
# 前に作ったリンクのうち、このリポジトリを指しているのに先が無くなったものは消す。
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$skills = Join-Path $repo '.claude\skills'
$agents = Join-Path $repo '.claude\agents'
$dest = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME '.claude' }
$destSkills = Join-Path $dest 'skills'
$destAgents = Join-Path $dest 'agents'
New-Item -ItemType Directory -Force $destSkills, $destAgents | Out-Null

function Get-LinkTarget($item) {
  $target = $item.Target
  if ($target -is [array]) { $target = $target[0] }
  return [string]$target
}

# 前に作ったリンクのうち、このリポジトリを指していて、先が無くなったものを消す(ほかのリンクや、リンクでないものは触らない)
foreach ($dir in $destSkills, $destAgents) {
  foreach ($item in Get-ChildItem $dir -Force) {
    if (-not $item.LinkType) { continue }
    $target = Get-LinkTarget $item
    if ($target.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path $target)) {
      $item.Delete()
      Write-Output "消した(先が無い): $($item.FullName)"
    }
  }
}

function Set-Link($Path, $Target) {
  if (Test-Path $Path) {
    $item = Get-Item $Path -Force
    if (-not $item.LinkType) { throw "リンクではないものがあるので、置き換えません: $Path" }
    $item.Delete()
  }
  New-Item -ItemType Junction -Path $Path -Target $Target | Out-Null
}

foreach ($skill in Get-ChildItem $skills -Directory) {
  Set-Link (Join-Path $destSkills $skill.Name) $skill.FullName
  Write-Output "skills/$($skill.Name)"
}
foreach ($group in Get-ChildItem $agents -Directory -ErrorAction SilentlyContinue) {
  Set-Link (Join-Path $destAgents $group.Name) $group.FullName
  Write-Output "agents/$($group.Name)"
}

Write-Output ''
Write-Output "リンクしました: $dest"
Write-Output '~/.claude/settings.json に次を設定してください(どのプロジェクトから呼んでも効くように、ユーザーの設定に置く):'
Write-Output "  env.DEV_WORKBENCH_HOME = `"$($repo.Replace('\', '/'))`""
Write-Output '  env.DEV_WORKBENCH_DOCS = "<Google ドライブ パソコン版の同期フォルダの中の、作業の置き場>"'
Write-Output '  permissions.additionalDirectories に、上の2つのパスを足す'
