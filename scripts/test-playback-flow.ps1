# Hills Lite playback & library interaction test script
# Builds release, verifies artifacts, launches app for manual QA.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/test-playback-flow.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/test-playback-flow.ps1 -SkipBuild
#   powershell -ExecutionPolicy Bypass -File scripts/test-playback-flow.ps1 -Launch

param(
    [switch]$SkipBuild,
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Assert-PathExists($path, [string]$label) {
    if (-not (Test-Path $path)) {
        throw "MISSING $label`: $path"
    }
    Write-Host "OK  $label" -ForegroundColor Green
    Write-Host "    $path" -ForegroundColor DarkGray
}

Write-Host "`n=== Hills Lite Playback Flow Test ===" -ForegroundColor Cyan
Write-Host "Root: $Root`n"

if (-not $SkipBuild) {
    Write-Host "==> Step 1/3: Frontend typecheck + vite build" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

    Write-Host "`n==> Step 2/3: Tauri release build" -ForegroundColor Cyan
    npm run tauri:build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} else {
    Write-Host "==> Skipping build (-SkipBuild)" -ForegroundColor Yellow
}

Write-Host "`n==> Step 3/3: Artifact checks" -ForegroundColor Cyan
$exe = Join-Path $Root "src-tauri\target\release\emby-player.exe"
$mpv = Join-Path $Root "src-tauri\target\release\resources\mpv\mpv.exe"
$dist = Join-Path $Root "dist\index.html"

Assert-PathExists $dist "embedded frontend"
Assert-PathExists $exe "release executable"

if (Test-Path $mpv) {
    Assert-PathExists $mpv "bundled mpv"
} else {
    Write-Host "WARN bundled mpv not found — playback requires system mpv in PATH" -ForegroundColor Yellow
    Write-Host "    $mpv" -ForegroundColor DarkGray
}

Write-Host "`n=== Manual QA checklist ===" -ForegroundColor Cyan
@(
    "[ ] Home -> click library thumbnail -> list loads",
    "[ ] Library -> click poster -> detail page opens",
    "[ ] Detail -> Play -> embedded video plays (no channel closed)",
    "[ ] Back to detail -> library cards still clickable",
    "[ ] Play again 2-3 times without IPC errors"
) | ForEach-Object { Write-Host $_ }

if ($Launch) {
    Write-Host "`nLaunching release build..." -ForegroundColor Cyan
    Start-Process $exe
} else {
    Write-Host "`nTo launch: powershell -File scripts\run-release.ps1" -ForegroundColor DarkGray
}

Write-Host "`nAll automated checks passed." -ForegroundColor Green
