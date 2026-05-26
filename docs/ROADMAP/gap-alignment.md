# 差距对齐路线图（G1–G9）

来源：[`PROJECT_MEMORY.md`](../PROJECT_MEMORY.md) §4。  
状态：**文档已建立，代码修复待寸止排期**。

---

## G9 — 打开闪退（P0）

**现象**：双击 exe 窗口闪退。  
**已有**：`lib.rs` → `%LOCALAPPDATA%/EmbyPlayer/crash.log`

**下一步**：
1. 用户运行最新 exe
2. 贴 `crash.log` 全文
3. 按 panic 位置修复（常见：store 反序列化、SMTC、global-shortcut）

**验证**：exe 启动 → Sidebar 可见 → 无 crash.log 新条目

---

## G6/G7 — 文档体系（P0）

**状态**：✅ 2026-05-25 bootstrap 完成

- `PROJECT_MEMORY.md`
- `STANDARDS.md`
- `CHANGE_LOG/` 首条日志
- `CURRENT_STATE.md` 重写

---

## G3 — MPV IPC 命名管道（P1）

**目标**：`--input-ipc-server=\\.\pipe\hills-lite-mpv-<uuid>` + 异步连接  
**现状**：`src-tauri/src/mpv/ipc.rs` 使用 `--input-ipc-client=fd://0` + stdin/stdout

**风险**：改动面大，需全量播放回归  
**依赖**：是否与 G4 内置 mpv 一起做需寸止确认

---

## G4 — 内置 MPV（P1）

**目标**：
- `src-tauri/resources/mpv/mpv.exe`（~120MB）
- `build.rs` 复制到 `target/<profile>/resources/mpv/`
- `tauri.conf.json` `bundle.resources`
- `resolve_mpv_exe()` 优先查找 bundle 路径

**现状**：仅 `resources/mpv/mpv/fonts.conf`

**需寸止**：
- mpv.exe 是否 Git LFS / 用户本机放置 / CI 下载？
- 目标 mpv 版本与构建来源（shinchiro vs gyan.dev）？

---

## G1 — 品牌 Hills Lite（P2）

**范围**：
- `tauri.conf.json` productName / title
- `index.html` title
- `AppSidebar.vue` / `SettingsView.vue` / `tray/mod.rs` / `RemoteControlView.vue`
- `MpvBanner.vue`（已部分正确）

**不做**：Rust crate 重命名（可后续独立任务）

---

## G2 — 收藏 / 聚合视界路由（P2）

**现状**：`FavoritesView.vue`、`AggregateView.vue` 已实现列表/占位，router 无 `/favorites` `/aggregate`

**改动**：
- `router/index.ts` 注册路由
- `AppSidebar.vue` 增加导航项（记忆要求的一级导航）

---

## G5 — 构建只产 exe（P2）

**改动**：`tauri.conf.json`

```json
"bundle": {
  "active": false
}
```

或 `"targets": []`（视 Tauri 2 行为而定，改前查官方文档）

**验证**：`npm run tauri:build` 后仅有 `target/release/emby-player.exe`，无 `bundle/nsis|msi`

---

## G8 — Player back() fire-and-forget（P3）

**目标**：`PlayerView.vue` 返回时不 await `player.stop()`，防 mpv 卡死拖住 UI

**验证**：播放中点返回，UI 立即响应

---

## 建议执行顺序

```
G9（有日志后）→ G3+G4（MPV 稳定性）→ G5（构建）→ G1+G2（品牌与导航）→ G8
```

每项完成后：**CHANGE_LOG + 更新 CURRENT_STATE + 寸止反馈**。
