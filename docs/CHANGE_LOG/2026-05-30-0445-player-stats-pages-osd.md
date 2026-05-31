# 2026-05-30 04:45 播放器 Stats 分页与 mpv OSD 模式

## 目标

补齐播放器统计浮层到“综合 / 视频 / 音频 / 轨道 / Whisper”五页结构，并允许用户在播放行为设置里切回 mpv 自带 stats OSD。

## 变更

- `AppSettings` 新增 `statsOverlayMode: "winui" | "mpv-osd"`，Electron、Tauri 与 Web 预览默认均为 `winui`。
- 设置页播放器面板新增“统计浮层”分段控件，可在 WinUI 与 mpv OSD 之间切换并持久化。
- 播放器 Stats 浮层改为五页标签页：综合、视频、音频、轨道、Whisper。
- Electron / Tauri mpv snapshot 增加视频/音频 codec、参数、FPS、码率和丢帧等统计字段，轨道列表保留 codec、默认、强制、外部与当前状态。
- 新增 `show_mpv_stats_osd` 命令；mpv OSD 模式下播放器设置菜单的统计入口会调用 mpv `stats/display-page-N` 脚本绑定，失败时回退 `stats/display-stats`。

## 验证

已通过：

```powershell
node --check electron\main.mjs
node --check electron\backend\mpv.mjs
node --check electron\backend\store.mjs
npm.cmd run check:electron-commands
npm.cmd run build
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
rg -n "[ \t]+$" src\views\PlayerView.vue src\views\SettingsView.vue src\types\models.ts src\stores\settings.ts src\platform\index.ts src\api\index.ts electron\main.mjs electron\backend\mpv.mjs electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src-tauri\src\commands\player.rs src-tauri\src\mpv\backend.rs src-tauri\src\mpv\ipc.rs src-tauri\src\mpv\embedded.rs src-tauri\src\lib.rs
npm.cmd run electron:build
```

浏览器验证：

- `http://127.0.0.1:1420/` 进入设置页，展开播放器面板，可见“统计浮层 / WinUI / mpv OSD”。
- 点击 `mpv OSD` 后 active 状态切换成功，再切回 `WinUI`，控制台 error 列表为空。
- 试图直接冷开播放器路由时因 Web 预览无账号仍被首启引导拦住，因此本轮未在真实播放会话中人工点击 Stats 五页；该部分已由 TypeScript 构建、Electron 打包和命令覆盖检查验证接线。

## 当前状态

- 默认仍显示 WinUI Stats 五页浮层。
- 用户在设置页切到 mpv OSD 后，播放器菜单中的统计入口会触发 mpv 自带 stats OSD。
