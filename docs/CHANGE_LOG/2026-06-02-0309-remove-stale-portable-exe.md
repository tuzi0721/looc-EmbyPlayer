# 删除旧 portable exe

## 背景

用户确认当前最新版是 Electron unpacked 目录里的 `Hills Lite.exe`，旧 portable 单文件包仍停留在 2026-05-30，容易被误用。

## 变更

- 删除本地旧产物：`release-electron\Hills Lite 0.1.0.exe`。
- 更新当前状态，明确 portable 单文件包当前不存在，最新版只看 `release-electron\win-unpacked\Hills Lite.exe`。

## 验证

- 通过：旧 portable 路径 `Test-Path` 返回 `False`。
- 通过：最新 unpacked exe 仍存在，文件时间为 2026-06-01 22:02:16。

## 风险

- 本阶段只删除旧发布产物，不影响源码和最新 unpacked 可执行文件。
- 以后如需 portable 单文件包，需要重新跑通 `npm.cmd run electron:dist` 并解决 NSIS 下载阻塞。

## 回滚

- 重新成功执行 `npm.cmd run electron:dist` 生成新的 portable 单文件包。
