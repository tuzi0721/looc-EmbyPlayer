# 2026-05-29 05:45 - 首启引导基础

## 本段目标
- 增加一次性的首启引导，让新安装或新配置目录可以快速进入服务器、播放器和首页入口，并将完成状态持久化。

## 变更
- `AppSettings` 新增 `firstRunCompleted`，前端默认设置、Electron store 与 Tauri 配置模型保持一致。
- Tauri `update_settings` 支持写入首启完成状态。
- 新增 `FirstRunGuide` 组件，提供添加/管理服务器、播放器设置、进入首页三个入口，并可关闭。
- `App.vue` 在设置、服务器、账号等启动数据刷新完成后再判断是否显示引导，避免旧用户短暂闪现引导层。
- 播放器全屏路由下不会显示首启引导。

## 验证
- 初轮 `node --check electron\backend\store.mjs` 通过。
- 初轮 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\components\common\FirstRunGuide.vue src\App.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0545-first-run-guide.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
