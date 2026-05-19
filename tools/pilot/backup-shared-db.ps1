param(
  [string]$SharedDbPath = "C:\AI-Lab-Shared\dev.sqlite",
  [string]$BackupDir = "C:\AI-Lab-Shared\backups"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $SharedDbPath)) {
  throw "Не найдена база для резервной копии: $SharedDbPath"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $BackupDir "dev-$stamp.sqlite"
Copy-Item -LiteralPath $SharedDbPath -Destination $backupPath

Write-Host "Резервная копия создана:"
Write-Host $backupPath
