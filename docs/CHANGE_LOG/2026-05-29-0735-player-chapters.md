# 2026-05-29 07:35 - 播放器章节列表

## 本段目标
- 补齐播放器章节能力，让带章节的媒体可以在播放页直接查看章节并跳转。

## 变更
- mpv snapshot 新增 `chapters` 与当前 `chapter` 字段；前端类型同步新增 `MpvChapterInfo`。
- Electron mpv 控制器读取 `chapter-list` 与 `chapter`，并将章节时间转换为毫秒。
- Tauri IPC 后端读取并解析 mpv `chapter-list`；embedded 后端保留空章节字段以保持 snapshot 结构一致。
- 播放器底部工具栏新增章节按钮；存在章节时可展开列表，展示章节时间与标题，并支持点击跳转。
- Stats 浮层新增当前章节行，方便确认当前播放位置所在章节。

## 验证
- `node --check electron\backend\mpv.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg -n "[ \t]+$" electron\backend\mpv.mjs src-tauri\src\mpv\backend.rs src-tauri\src\mpv\ipc.rs src-tauri\src\mpv\embedded.rs src\types\models.ts src\views\PlayerView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0735-player-chapters.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
