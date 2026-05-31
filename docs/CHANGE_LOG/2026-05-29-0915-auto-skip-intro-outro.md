# 2026-05-29 09:15 - 自动跳过片头片尾
## 本段目标
- 把播放器设置菜单里的“跳过片头/片尾”从占位改为可用的基础自动跳过能力，先提供本地秒数规则，不依赖服务器标记或外部识别服务。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增 `skipIntroOutroEnabled`、`skipIntroSeconds`、`skipOutroSeconds`，默认关闭，默认片头/片尾各 90 秒。
- 设置页播放器面板新增“自动跳过片头/片尾”开关，以及片头/片尾秒数输入；Tauri 更新路径会把秒数限制在 `0..=600`。
- 播放器设置菜单里的“跳过片头/片尾 PRO”占位改为真实开关，可快速启停同一持久设置。
- 播放页新增自动跳过逻辑：每个播放条目片头最多跳一次，当前位置在前 5 秒且媒体时长足够长时跳到配置秒数；片尾最多处理一次，只有播放队列存在下一项时才自动切下一项。
- 切换播放条目时会重置当前条目的片头/片尾自动跳过标记，避免跨集误判。

## 验证
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `node --check electron\main.mjs` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\views\SettingsView.vue src\views\PlayerView.vue` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实连续剧播放队列中的人工跳片头/片尾实测；已完成设置链路、类型、构建和 Electron 打包验证。
