param(
  [string]$ShareDir = "C:\AI-Lab-Shared",
  [string]$ShareName = "AI-Lab-DB",
  [string]$SourceDb = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

$repoRoot = Resolve-RepoRoot
if ([string]::IsNullOrWhiteSpace($SourceDb)) {
  $SourceDb = Join-Path $repoRoot "packages\database\prisma\dev.sqlite"
}

if (!(Test-Path -LiteralPath $SourceDb)) {
  throw "Не найдена исходная база: $SourceDb"
}

New-Item -ItemType Directory -Force -Path $ShareDir | Out-Null

$targetDb = Join-Path $ShareDir "dev.sqlite"
if (!(Test-Path -LiteralPath $targetDb)) {
  Copy-Item -LiteralPath $SourceDb -Destination $targetDb
}

$acl = Get-Acl -LiteralPath $ShareDir
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  "Everyone",
  "Modify",
  "ContainerInherit,ObjectInherit",
  "None",
  "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $ShareDir -AclObject $acl

$existingShare = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($existingShare) {
  Write-Host "Сетевая папка уже существует: \\$env:COMPUTERNAME\$ShareName"
} else {
  New-SmbShare -Name $ShareName -Path $ShareDir -ChangeAccess "Everyone" | Out-Null
  Write-Host "Создана сетевая папка: \\$env:COMPUTERNAME\$ShareName"
}

Write-Host ""
Write-Host "Общая база готова:"
Write-Host "\\$env:COMPUTERNAME\$ShareName\dev.sqlite"
Write-Host ""
Write-Host "На ученических компьютерах запускай:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\tools\pilot\start-installed-with-shared-db.ps1 -SharedDbPath `"\\$env:COMPUTERNAME\$ShareName\dev.sqlite`""
