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

function Test-NeedsBuild {
    param(
        [string]$Exe,
        [string]$Target
    )
    if (-not (Test-Path $Exe)) { return $true }
    $ExeTime = (Get-Item $Exe).LastWriteTime
    $Inputs = @(
        (Join-Path $Root "package.json"),
        (Join-Path $Root "src-tauri\tauri.conf.json"),
        (Join-Path $Root "src-tauri\build.rs")
    )
    if ($Target -eq "tauri") {
        $Inputs += (Join-Path $Root "dist\index.html")
        $Inputs += (Join-Path $Root "src-tauri\resources\mpv\mpv.exe")
        $Inputs += (Join-Path $Root "src-tauri\resources\mpv\libmpv-2.dll")
    }
    foreach ($InputPath in $Inputs) {
        if ((Test-Path $InputPath) -and (Get-Item $InputPath).LastWriteTime -gt $ExeTime) {
            return $true
        }
    }
    return $false
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

if (Test-NeedsBuild $Exe $Target) {
    Write-Host "$Label is missing or stale. Building..." -ForegroundColor Yellow
    Invoke-CheckedNpm $BuildScript
}

if ($NoLaunch) {
    Write-Host "$Label ready: $Exe" -ForegroundColor Green
    exit 0
}

Write-Host "Starting Hills Lite ($Label): $Exe" -ForegroundColor Cyan
Start-Process -FilePath $Exe
