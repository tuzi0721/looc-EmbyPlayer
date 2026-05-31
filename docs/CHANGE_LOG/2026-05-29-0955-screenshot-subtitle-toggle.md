# 2026-05-29 09:55 - 截图字幕开关
## 本段目标
- 把底层已支持的“截图是否包含字幕”能力暴露给用户，避免截图场景只能固定带字幕。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增 `screenshotIncludeSubtitles` / `screenshot_include_subtitles`，默认开启。
- 设置页播放器面板新增“截图包含字幕”开关。
- 播放器设置菜单新增同名快捷开关，便于播放时临时切换。
- 播放器截图按钮调用 `api.takeScreenshot` 时会按当前设置传递 `includeSubtitles`。

## 验证
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `node --check electron\main.mjs` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\views\PlayerView.vue src\views\SettingsView.vue` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实截图文件的人工对比验证；已完成设置链路、类型、构建和 Electron 打包验证。
