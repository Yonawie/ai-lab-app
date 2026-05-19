param(
  [Parameter(Mandatory = $true)]
  [string]$SharedDbPath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $SharedDbPath)) {
  throw "Не найдена общая база: $SharedDbPath"
}

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

$env:AI_LAB_DATABASE_PATH = $SharedDbPath
Write-Host "AI_LAB_DATABASE_PATH=$env:AI_LAB_DATABASE_PATH"
Write-Host "Запускаю AI Lab в dev-режиме..."

Set-Location $repoRoot
pnpm --filter "@ai-lab/desktop" tauri:dev
