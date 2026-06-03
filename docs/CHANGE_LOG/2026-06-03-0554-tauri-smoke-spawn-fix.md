# 2026-06-03 05:54 Tauri smoke spawn fix

## 背景
- 真实 Tauri visual smoke 在进入 `tauri-dev-launch` 后失败于 `Error: spawn EINVAL`。

## 本阶段诊断
- 最小复现确认：Node v24 在当前 Windows 环境下直接 `spawn("npm.cmd", ...)` 会失败于 `EINVAL`。
- 通过 `cmd.exe /d /s /c npm.cmd --version` 启动则正常。

## 本阶段变更
- `scripts/real-server-visual-smoke.mjs` 的 `tauri-dev` 分支在 Windows 下改为：
  - `cmd.exe /d /s /c "npm.cmd run tauri -- dev --features mpv-embedded"`
- 非 Windows 仍保留 `npm run tauri -- dev --features mpv-embedded`。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs` 通过。
- 最小 `cmd.exe /d /s /c npm.cmd --version` spawn 自检通过，输出 `11.12.1`。

## 结论
- Tauri dev smoke 的启动方式已修复，可以继续执行真实服务器 visual smoke。
