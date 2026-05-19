param(
  [Parameter(Mandatory = $true)]
  [string]$SharedDbPath,
  [string]$AppExe = ""
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $SharedDbPath)) {
  throw "Не найдена общая база: $SharedDbPath"
}

if ([string]::IsNullOrWhiteSpace($AppExe)) {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\AI Lab\AI Lab.exe",
    "$env:ProgramFiles\AI Lab\AI Lab.exe",
    "${env:ProgramFiles(x86)}\AI Lab\AI Lab.exe"
  )
  $AppExe = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($AppExe) -or !(Test-Path -LiteralPath $AppExe)) {
  throw "Не найден AI Lab.exe. Передай путь через -AppExe `"C:\Path\AI Lab.exe`" или запусти dev-скрипт."
}

$env:AI_LAB_DATABASE_PATH = $SharedDbPath
Write-Host "AI_LAB_DATABASE_PATH=$env:AI_LAB_DATABASE_PATH"
Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe)
