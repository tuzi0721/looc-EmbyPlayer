# 差距对齐路线图（G1–G9）

来源：[`PROJECT_MEMORY.md`](../PROJECT_MEMORY.md) §4。  
状态：**2026-05-30 已按当前代码校正；仅 G9 仍等待真实启动日志触发**。

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

**状态**：✅ 已完成

**目标**：`--input-ipc-server=\\.\pipe\hills-lite-mpv-<uuid>` + 异步连接
**现状**：`src-tauri/src/mpv/ipc.rs` 已使用 `--input-ipc-server`，Windows 命名管道为 `\\.\pipe\hills-lite-mpv-{uuid}`；Electron mpv 后端也使用同一随包 mpv 模型。

**验证**：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets` 与 `npm.cmd run electron:build` 已通过。

---

## G4 — 内置 MPV（P1）

**状态**：✅ 已完成；不再从本机路径或网络下载 mpv

**目标**：
- `src-tauri/resources/mpv/mpv.exe`（~120MB）
- `build.rs` 复制到 `target/<profile>/resources/mpv/`
- `tauri.conf.json` `bundle.resources`
- `resolve_mpv_exe()` 优先查找 bundle 路径

**现状**：仓库内 `src-tauri/resources/mpv` 已包含 `mpv.exe`、`libmpv-2.dll`、`d3dcompiler_43.dll` 与 `mpv/fonts.conf`；Tauri `build.rs` 只复制该目录，Electron `extraResources` 复制同一目录到 `resources/mpv`，`check:electron-package` 会在打包后校验完整性。

**规则**：mpv 更新只随应用新版本迭代进入随包资源，不恢复本机 mpv 检测、路径选择或构建期下载。

---

## G1 — 品牌 Hills Lite（P2）

**状态**：✅ 当前用户可见壳层已统一为 Hills Lite；包名/ crate 名保留历史命名

**范围**：
- `tauri.conf.json` productName / title
- `index.html` title
- `AppSidebar.vue` / `SettingsView.vue` / `tray/mod.rs` / `RemoteControlView.vue`
- 旧 `MpvBanner.vue` 已移除；不再提供本机 mpv 检测入口

**不做**：Rust crate 重命名（可后续独立任务）

---

## G2 — 收藏 / 聚合视界路由（P2）

**状态**：✅ 已完成

**现状**：`/favorites`、`/history`、`/aggregate`、`/downloads`、`/remote` 均已注册路由并接入侧边栏主导航。

**改动**：
- `router/index.ts` 注册路由
- `AppSidebar.vue` 增加导航项（记忆要求的一级导航）

---

## G5 — 构建只产 exe（P2）

**状态**：✅ 已完成

**改动**：`tauri.conf.json`

```json
"bundle": {
  "active": false
}
```

或 `"targets": []`（视 Tauri 2 行为而定，改前查官方文档）

**现状**：`src-tauri/tauri.conf.json` 已设置 `bundle.active: false` 与 `targets: []`；发布验证以 `src-tauri\target\release\emby-player.exe` 为准。

---

## G8 — Player back() fire-and-forget（P3）

**状态**：✅ 已完成

**目标**：`PlayerView.vue` 返回时不 await `player.stop()`，防 mpv 卡死拖住 UI

**现状**：播放页返回使用 fire-and-forget stop；离开播放页的后台清理改为并行执行。

---

## 建议执行顺序

```
G9（有真实 crash.log 后）→ 继续按产品路线推进真实联调、可用性清理和视觉验证
```

每项完成后：**CHANGE_LOG + 更新 CURRENT_STATE + 寸止反馈**。
