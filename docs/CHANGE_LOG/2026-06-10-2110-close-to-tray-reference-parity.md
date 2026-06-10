# 2026-06-10 21:10 设置·通用「关闭时最小化到托盘」（参考对齐）

## 背景
复刻 A:\下载\HillsLite-v1.2.1 设置功能（规格 `docs/UI_REFERENCE_HILLS_LITE.md` 图4·通用）。
盘点结论：备份与还原（export/import_config + UI）、主题、同步(Trakt)、外部播放器、弹幕、
网络参数均已存在；**缺「关闭时最小化到托盘」**，本次补齐（双宿主）。

## 变更
- Rust `config/models.rs`：`AppSettings.close_to_tray`（默认 false，serde default 兼容旧配置）。
- Rust `commands/settings.rs`：`SettingsPatch.close_to_tray` + update_settings 落盘。
- Rust `lib.rs`：main 窗口 `CloseRequested` 时若开启 → `api.prevent_close()` + 隐藏窗口
  （托盘已有 显示窗口/退出 菜单；退出走 tray:quit → 正常清理播放）。
- Electron `main.mjs`：`win.on("close")` 在非托盘退出(`desktopIntegration.quitting`)且开启时
  → `preventDefault()+hide()`；`store.mjs` 新增 `getSettingsSync()`（窗口生命周期内同步读）。
- 前端：`types/models.ts`/`platform/index.ts`/`stores/settings.ts`/`electron store` 默认值；
  `SettingsView.vue` 通用区（备份与还原之后、网络之前，按参考顺序）新增开关行。

## 验证
- `cargo check --features mpv-embedded` 绿（1m01s）。
- `npm run build`（vue-tsc+vite+门禁）绿；`node --check` main.mjs/store.mjs 绿。
- `check:electron-commands` 绿（109/105/5，无新 invoke 命令）。
- 行为验证待真机：开启开关 → 点窗口 ✕ → 应隐藏到托盘、播放不中断；托盘「退出」→ 正常清理退出。

## 设置功能对齐盘点（参考 vs 我们，本轮核实）
| 参考设置项 | 状态 |
|---|---|
| Hills Lite Pro | 占位入口（产品定位暂缓） |
| 语言 Auto | ❌ 缺（需 i18n 基建，已记 Wave2） |
| 主题 | ✅ |
| 媒体库 | ✅（hiddenServerIds 等） |
| 备份与还原 | ✅（merge/replace 导入 + 快捷键合并） |
| 同步 | ✅（Trakt 开关组） |
| 关闭时最小化到托盘 | ✅ **本次补齐** |
| 网络 | 部分（心跳/超时有；系统代理❌，已记 Wave2） |
| 交互/播放器/外部播放器/弹幕 | ✅ |
