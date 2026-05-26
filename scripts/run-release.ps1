# Launch the release build (embedded frontend, not localhost:1420)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Exe = Join-Path $Root "src-tauri\target\release\emby-player.exe"

if (-not (Test-Path $Exe)) {
    Write-Host "Release exe not found. Building..." -ForegroundColor Yellow
    Set-Location $Root
    npm run tauri:build
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "Starting Hills Lite (release): $Exe" -ForegroundColor Cyan
Start-Process $Exe
