# 2026-05-30 04:20 发布启动脚本目标化

## 目标

让 `scripts/run-release.ps1` 跟上当前 Electron-first 发布路径，同时保留 Tauri release 与 Electron portable 的启动能力。

## 变更

- `scripts/run-release.ps1` 默认目标改为 `electron`，启动 `release-electron\win-unpacked\Hills Lite.exe`。
- 新增 `-Target electron|portable|tauri` 参数，分别对应 Electron unpacked、Electron portable 与 Tauri release。
- 新增 `-NoLaunch` 参数，用于只检查/按需构建产物而不启动 GUI。
- 内部构建命令改为 `npm.cmd run <script>`，并复用 `electron:build`、`electron:dist`、`tauri:build` 中已经接好的完整性闸门。
- portable 路径从 `package.json` 的 `build.productName` 与 `version` 自动推导。

## 验证

已通过：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-release.ps1 -Target electron -NoLaunch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-release.ps1 -Target portable -NoLaunch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-release.ps1 -Target tauri -NoLaunch
脚本接线检查
行尾空白检查
```

结果：三种目标均能定位现有 release 产物，不触发 GUI 启动；默认路径已经是 Electron unpacked。

## 当前状态

- 日常“跑 release”默认进入 Electron release。
- 需要验证 portable 或 Tauri 时，可显式传 `-Target portable` 或 `-Target tauri`。
