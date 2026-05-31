# 2026-05-31 02:46 播放源切换验证

## 目标

验证播放器线路 / 媒体源切换改动没有破坏 Electron 打包链、Tauri 编译面和播放器前端构建。

## 验证

已通过：

```powershell
node --check electron\backend\emby.mjs
node --check electron\main.mjs
npm.cmd run check:electron-commands
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
npm.cmd run build
npm.cmd run electron:build
rg -n "[ \t]+$" electron\backend\emby.mjs electron\main.mjs src\api\index.ts src\stores\player.ts src\views\PlayerView.vue src-tauri\src\commands\player.rs docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-31-0236-playback-source-api.md docs\CHANGE_LOG\2026-05-31-0241-player-source-switcher.md
```

结果：

- Electron 命令覆盖检查通过，当前 86 个 renderer 命令全部覆盖。
- Rust `cargo check --all-targets` 通过。
- Electron unpacked 打包链通过，`release-electron\win-unpacked\resources\mpv` 仍包含 6 个随包 mpv 文件，总量 213.7 MiB，`app.asar` 存在。
- 行尾空白检查无命中。

## 未完成验证

- 尝试用 in-app Browser 打开 `http://127.0.0.1:1420/` 做本地视觉冒烟时，被浏览器安全策略拒绝；未绕过该限制。
- 尚未在真实账号下人工点击播放源切换，下一轮继续做真实联调或选择下一个未完全落地的用户功能。

## 当前状态

- 代码级、构建级和 Electron 打包级验证均已通过。
- 播放源切换的真实播放行为仍需要在 Electron release 或 dev 环境里用真实媒体做人工确认。
