# 2026-05-29 04:10 - 弹幕持久设置

## 本段目标
- 将播放器弹幕透明度、速度和字号从会话内临时值改为可在设置页保存的持久偏好。

## 变更
- `AppSettings` 新增 `danmakuOpacity`、`danmakuSpeed`、`danmakuFontSize`，前端默认值、Electron store 默认值与 Tauri 配置模型保持一致。
- Tauri `update_settings` 补齐弹幕设置写入，并顺手补齐既有 `appendAuthQuery`、`homeHeroStyle`、`closeToTray` 写入路径。
- 设置页播放器分组新增“弹幕”面板，提供透明度、速度和字号滑杆，摘要显示字号与速度。
- 播放页 `DanmakuOverlay` 改为直接读取设置 store 中的弹幕参数，设置修改后后续播放会沿用。

## 验证
- `node --check electron\backend\store.mjs` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `rg -n "[ \t]+$" electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\types\models.ts src\stores\settings.ts src\views\SettingsView.vue src\views\PlayerView.vue src\components\common\AppSidebar.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0410-danmaku-settings.md` 无输出。
- `npm.cmd run build` 通过。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
