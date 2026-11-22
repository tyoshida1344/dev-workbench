# このリポジトリのスキル(skills/)とサブエージェント(agents/)を ~/.claude にリンクし、どのプロジェクトからも使えるようにする。
# リンクなので、中身はこのリポジトリのまま(git pull すれば新しくなる)。
#   スキル(フォルダ)はジャンクション、サブエージェント(ファイル)はシンボリックリンクで作る。
#   シンボリックリンクには、Windows の「開発者モード」をオンにするか、管理者として実行する必要がある。
$ErrorActionPreference = 'Stop'

$home_ = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dest = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME '.claude' }
New-Item -ItemType Directory -Force (Join-Path $dest 'skills'), (Join-Path $dest 'agents') | Out-Null

function Set-Link($Path, $Target, $Type) {
  if (Test-Path $Path) {
    $item = Get-Item $Path -Force
    if (-not $item.LinkType) { throw "リンクではないものがあるので、置き換えません: $Path" }
    $item.Delete()
  }
  New-Item -ItemType $Type -Path $Path -Target $Target | Out-Null
}

foreach ($skill in Get-ChildItem (Join-Path $home_ 'skills') -Directory) {
  Set-Link (Join-Path $dest "skills\$($skill.Name)") $skill.FullName 'Junction'
  Write-Output "skills/$($skill.Name)"
}
foreach ($agent in Get-ChildItem (Join-Path $home_ 'agents') -Filter '*.md' -File -ErrorAction SilentlyContinue) {
  try {
    Set-Link (Join-Path $dest "agents\$($agent.Name)") $agent.FullName 'SymbolicLink'
    Write-Output "agents/$($agent.Name)"
  }
  catch {
    Write-Warning "agents/$($agent.Name) をリンクできませんでした。開発者モードをオンにするか、管理者として実行してください: $($_.Exception.Message)"
  }
}

Write-Output ''
Write-Output "リンクしました: $dest"
Write-Output '~/.claude/settings.json に次を設定してください(どのプロジェクトから呼んでも効くように、ユーザーの設定に置く):'
Write-Output "  env.DEV_WORKBENCH_HOME = `"$($home_ -replace '\', '/')`""
Write-Output '  env.DEV_WORKBENCH_DOCS = "<Google ドライブ パソコン版の同期フォルダの中の、作業の置き場>"'
Write-Output '  permissions.additionalDirectories に、上の2つのパスを足す'
