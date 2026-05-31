# 2026-05-29 04:45 - 外部播放器基础配置

## 本段目标
- 补齐外部播放器的基础设置与播放入口，让当前媒体可以从播放器菜单交给系统默认播放器或用户指定的外部播放器打开。

## 变更
- `AppSettings` 新增 `externalPlayerPath` 与 `externalPlayerArgs`，前端默认值、Electron store 与 Tauri 配置模型保持一致。
- 设置页“外部播放器”从静态占位改为可展开面板，支持填写/选择播放器路径、清除路径和保存启动参数。
- 新增 `api.playExternal` / `play_external` 命令；Electron 使用 `child_process.spawn` 启动指定播放器，未配置路径时回退到系统默认打开流地址。
- Tauri 侧同步补齐 `play_external` 命令，复用现有 Emby/Jellyfin 播放源构建逻辑并启动外部进程。
- 播放器设置菜单新增“外部播放器”入口，会把当前媒体、当前位置和标题传给外部播放命令。
- 外部播放器路径输入与 MPV 路径输入改为显式保存调用，避免原生事件对象误传入保存函数。

## 验证
- 初轮 `node --check electron\main.mjs` 通过。
- 初轮 `node --check electron\backend\store.mjs` 通过。
- 初轮 `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- 初轮 `npm.cmd run build` 通过。
- `rg -n "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs electron\main.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src-tauri\src\commands\player.rs src-tauri\src\lib.rs src\api\index.ts src\views\SettingsView.vue src\views\PlayerView.vue src\components\common\AppSidebar.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0445-external-player.md` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
