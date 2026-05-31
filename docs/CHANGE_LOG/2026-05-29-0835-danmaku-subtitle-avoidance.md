# 2026-05-29 08:35 - 弹幕避让字幕
## 本段目标
- 新增弹幕避让字幕的持久化设置，让弹幕默认不占用播放器底部字幕区域，并允许用户调整底部保留比例。

## 变更
- `AppSettings`、Electron store、Tauri config 与设置更新命令新增 `danmakuAvoidSubtitles` / `danmaku_avoid_subtitles` 和 `danmakuBottomReservePct` / `danmaku_bottom_reserve_pct`，默认开启避让并保留底部 18%。
- 设置页弹幕面板新增“避让字幕”开关与“底部避让区域”百分比滑杆；弹幕摘要同步显示当前是避让还是覆盖。
- 播放页将弹幕避让设置传给 `DanmakuOverlay`。
- `DanmakuOverlay` 按设置收缩弹幕容器底部 inset；切换字号、弹幕轨道数或避让比例时会清屏重排，避免旧弹幕继续停留在错误区域。
- Tauri 设置更新对底部避让比例做 `0..=40` 限制，防止异常配置挤占整个弹幕区域。

## 验证
- `node --check electron\backend\store.mjs` 通过。
- `cargo fmt --manifest-path src-tauri\Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 通过。
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `node --check electron\main.mjs` 通过。
- `rg "[ \t]+$" src\types\models.ts src\stores\settings.ts electron\backend\store.mjs src-tauri\src\config\models.rs src-tauri\src\commands\settings.rs src\views\PlayerView.vue src\views\SettingsView.vue src\components\player\DanmakuOverlay.vue` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实视频里“字幕 + 弹幕”同屏人工目检；已完成设置链路、类型、构建和 Electron 打包验证。
