param(
    [ValidateSet("electron", "portable", "tauri")]
    [string]$Target = "electron",
    [switch]$NoLaunch
)

# Launch a packaged release build (embedded frontend, not localhost:1420).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Package = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "package.json") | ConvertFrom-Json
$ProductName = $Package.build.productName
$Version = $Package.version

function Invoke-CheckedNpm {
    param([string]$Script)
    Set-Location $Root
    & npm.cmd run $Script
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Target) {
    "electron" {
        $Label = "Electron unpacked"
        $Exe = Join-Path $Root "release-electron\win-unpacked\$ProductName.exe"
        $BuildScript = "electron:build"
    }
    "portable" {
        $Label = "Electron portable"
        $Exe = Join-Path $Root "release-electron\$ProductName $Version.exe"
        $BuildScript = "electron:dist"
    }
    "tauri" {
        $Label = "Tauri release"
        $Exe = Join-Path $Root "src-tauri\target\release\emby-player.exe"
        $BuildScript = "tauri:build"
    }
}

if (-not (Test-Path $Exe)) {
    Write-Host "$Label exe not found. Building..." -ForegroundColor Yellow
    Invoke-CheckedNpm $BuildScript
}

if ($NoLaunch) {
    Write-Host "$Label ready: $Exe" -ForegroundColor Green
    exit 0
}

Write-Host "Starting Hills Lite ($Label): $Exe" -ForegroundColor Cyan
Start-Process -FilePath $Exe
