# Electron portable 构建阻塞

## 背景

本阶段尝试在已刷新 Electron unpacked 产物后继续刷新 portable 单文件包。unpacked 产物可用于当前桌面验证，但 portable exe 仍需要 `electron-builder --win portable` 完成。

## 变更

- 无代码变更。
- 记录当前发布产物状态：
  - 已刷新：`release-electron\win-unpacked\Hills Lite.exe`，文件时间 2026-06-01 22:02:16。
  - 未刷新：`release-electron\Hills Lite 0.1.0.exe`，文件时间仍为 2026-05-30 14:51:48。

## 验证

- 已通过：`npm.cmd run build`
- 已通过：`npm.cmd run electron:build`
- 已通过：`npm.cmd run check:no-planned-ui`
- 已通过：`npm.cmd run check:electron-commands`
- 已通过：`node scripts\smoke-electron-home-hero.mjs`
- 已通过：`node scripts\smoke-electron-embedded-local.mjs`

## 阻塞

- `npm.cmd run electron:dist` 在普通沙箱下先遇到网络/socket 权限问题。
- 高权限重跑后进入 `electron-builder --win portable`，但从 GitHub 下载 NSIS 依赖 `nsis-3.0.4.1.7z` 超时失败。
- 因此当前 portable 单文件 exe 不能视为最新产物，当前可用的最新桌面产物是 unpacked exe。

## 风险

- 如果用户直接分发 `release-electron\Hills Lite 0.1.0.exe`，会拿到 2026-05-30 的旧版本。
- 本阶段没有改变运行时代码，只记录产物状态，不影响现有 unpacked 验证结果。

## 回滚

- 删除本日志并把 `docs/CURRENT_STATE.md` 最新日志指回上一条即可。
