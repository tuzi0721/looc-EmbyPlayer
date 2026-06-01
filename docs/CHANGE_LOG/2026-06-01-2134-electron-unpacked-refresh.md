# Electron unpacked 包刷新

## 背景

前几轮已经连续修正服务器设置、侧边栏和旧脚本清理。为了避免用户拿到的 exe 仍是旧界面，本阶段刷新 Electron unpacked 包，并确认随包 mpv 与内嵌 helper 仍被正确打入发布目录。

## 验证

- 通过：`npm.cmd run electron:build`
  - `check:electron-commands`：101 个 renderer commands 与 101 个 Electron handlers 对齐，无显式 no-op 命令。
  - `check:local-decode`：145 个源码文件扫描通过，服务端转码入口未回归。
  - `check:no-planned-ui`：76 个源码文件扫描通过，未发现计划/占位 UI 文案。
  - `vue-tsc --noEmit` 与 `vite build` 通过。
  - `cargo build --manifest-path src-tauri/Cargo.toml --release --bin electron_mpv_host` 通过。
  - `electron-builder --win dir` 通过。
  - `check:electron-package` 通过：随包 mpv 目录、`electron_mpv_host.exe` 与 `app.asar` 均存在。

## 产物

- Electron unpacked exe：`release-electron\win-unpacked\Hills Lite.exe`
- 绝对路径：`A:\vsc\emby-player\release-electron\win-unpacked\Hills Lite.exe`
- 本次文件时间：2026-06-01 21:33:56

## 风险

- 本阶段只刷新本地构建产物；`release-electron/` 是忽略目录，不提交到 Git。
- 便携单文件包未刷新，本阶段只确认 unpacked exe。

## 回滚

- 无需回滚源码；如需恢复旧产物，可重新切换旧提交后再执行 `npm.cmd run electron:build`。
