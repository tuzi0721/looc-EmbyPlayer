# Hills Lite smoke test — build + artifact checks
# Usage: powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> npm run build" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

Write-Host "==> npm run tauri:build" -ForegroundColor Cyan
npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

$exe = Join-Path $Root "src-tauri\target\release\emby-player.exe"
$mpv = Join-Path $Root "src-tauri\target\release\resources\mpv\mpv.exe"
$dist = Join-Path $Root "dist\index.html"

foreach ($p in @($exe, $dist)) {
    if (-not (Test-Path $p)) { throw "missing artifact: $p" }
    Write-Host "OK  $p" -ForegroundColor Green
}

if (Test-Path $mpv) {
    Write-Host "OK  $mpv" -ForegroundColor Green
} else {
    Write-Host "WARN bundled mpv not found (IPC may use PATH mpv): $mpv" -ForegroundColor Yellow
}

Write-Host "`nAll smoke checks passed." -ForegroundColor Green
