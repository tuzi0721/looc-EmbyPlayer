# 全量代码审计报告

- **时间**：2026-05-25
- **范围**：`a:\vsc\emby-player` 全仓库（Rust 53 源文件 + Vue/TS 前端）
- **方法**：子 agent 逐模块读取 + 主 agent 交叉 grep 验证
- **目的**：在动手改代码前，建立**唯一可信**现状基线（取代已作废的 2026-05-24 CURRENT_STATE）

> **时效性说明（2026-05-26）**：本文是 2026-05-25 的历史快照。后续代码演进请以 `docs/CURRENT_STATE.md` 与 `docs/CHANGE_LOG/2026-05-26-2330-doc-audit-sync.md` 为准。

---

## 1. 执行摘要

| 维度 | 结论 |
|---|---|
| 功能完整度 | 核心链路（登录→库→详情→播放→下载→通知→遥控）**已实现** |
| 品牌 | UI 统一 **Emby Player**；Hills Lite 仅 1 处孤儿组件 |
| MPV | IPC `fd://0`；无内置 exe；无 `resolve_mpv_exe` |
| 孤儿代码 | 2 视图、3 组件未接入；MpvBanner 引用不存在 API |
| 半完成 | Favorites 只读无添加入口；Aggregate 纯占位 |
| 设置字段 | `hardwareDecoding` / `mpvCacheMb` **仅存不生效** |
| 构建 | 仍产 msi + nsis + exe |
| 后端命令 | **70** 个 Tauri invoke 已注册 |
| 前端 API | **58** 个 wrapper；与 MpvBanner 需求不对齐 |

> **后续修正注记（2026-05-26）**：品牌、路由接入、MpvBanner/API、MPV IPC 方式与构建策略均已有更新；本节表格仍保留审计当日结论用于追溯。

---

## 2. 后端（Rust）清单

### 2.1 模块树（53 文件）

```
lib.rs / main.rs / state.rs / error.rs
commands/     auth server media player settings danmaku download subtitle
              notifications remote shortcuts system_media
config/       models store
danmaku/      mod dandanplay types
download/     mod manager engine task stealth
emby/         mod client endpoints models socket session_controller
mpv/          mod backend ipc embedded manager window_host
network/      mod http heartbeat health health_scheduler racer
notifications/ mod center os_bridge types
system_media/ mod windows_smtc
tray/         mod
```

### 2.2 Tauri 命令（70）

| 模块 | 命令 |
|---|---|
| auth | login, logout, list_accounts, switch_account |
| server | list_servers, add_server, update_server, remove_server, test_lines, set_active_line |
| media | list_views, list_items, get_item_detail, search, resume_items, list_seasons, list_episodes, report_playback_progress, report_playback_stopped |
| player | play, pause, resume, stop, seek, set_speed, set_audio_track, set_subtitle_track, get_state, embed_attach, embed_set_rect, embed_set_visible, set_volume, set_muted |
| settings | get_settings, update_settings |
| danmaku | list_danmaku_providers, fetch_danmaku |
| download | list_downloads, start_download, pause_download, resume_download, cancel_download, remove_download, play_local |
| subtitle | list_subtitles, add_subtitle, remove_subtitle, set_subtitle_delay, set_subtitle_scale, cycle_subtitle |
| notifications | list_notifications, unread_count, dismiss_notification, mark_notification_read, mark_all_notifications_read, clear_notifications |
| remote | list_remote_sessions, remote_playstate, remote_play, remote_set_volume, remote_display_message |
| shortcuts | list_global_shortcuts, set_global_shortcut, clear_global_shortcut, reset_global_shortcuts |
| system_media | set_now_playing, set_now_playing_status, set_now_playing_position, clear_now_playing |

**不存在**：`detect_mpv`, `open_external`, `set_favorite`, `set_played`, `probe_server`（旧 CURRENT_STATE 曾声称有）

> **后续修正注记（2026-05-26）**：`detect_mpv` 与 `open_external` 已在 `commands/player.rs` 实现并注册。

### 2.3 MPV 实现

| 项 | IPC（默认） | Embedded（feature `mpv-embedded`） |
|---|---|---|
| 依赖 | 外部 `mpv` 进程 | libmpv2 |
| 路径 | `settings.mpv_executable_path` 或 `"mpv"` | 无 exe 路径 |
| 启动 | `--input-ipc-client=fd://0` + stdin/stdout JSON | `Mpv::new()` + 子窗口 wid |
| 窗口 | `--force-window=yes` 独立窗口 | Windows `EmbyPlayerMpvHost` 子窗口 |
| tracks | 解析 `track-list` | snapshot 中 tracks **恒为空** |

> **后续修正注记（2026-05-26）**：IPC 已切换为 `--input-ipc-server=<pipe/socket>`（Windows 命名管道），并在 stale 会话时自动重连。

### 2.4 后台任务（`state.rs::spawn_background_workers`）

1. `HeartbeatScheduler` — 保号
2. `HealthScheduler` — 线路测活 + 可选 failover + 通知
3. `DownloadManager::resume_persisted`
4. `restart_socket` — Emby WebSocket

### 2.5 启动与诊断（`lib.rs`）

- panic hook → `%LOCALAPPDATA%/EmbyPlayer/crash.log`
- `tauri::run` 失败同样写 crash.log
- Release `panic = "abort"`（无 Rust 栈）

### 2.6 资源与构建

| 路径 | 内容 |
|---|---|
| `resources/mpv/mpv/fonts.conf` | 仅此 1 文件 |
| `build.rs` | 仅 `tauri_build::build()` |
| `tauri.conf.json` | 无 `bundle.resources`；`bundle.active: true`, `targets: all` |

> **后续修正注记（2026-05-26）**：`tauri.conf.json` 已改为 `bundle.active: false` 与 `targets: []`（仅验证 exe）。

### 2.7 TODO/FIXME

全 `src-tauri` **无** TODO/FIXME/unimplemented 标记。

---

## 3. 前端清单

### 3.1 视图 vs 路由

| 视图 | 路由 | 状态 |
|---|---|---|
| HomeView | `/home` | ✅ |
| LoginView | `/login` | ✅ |
| LibraryView | `/library/:id` | ✅ |
| DetailView | `/item/:id` | ✅ |
| PlayerView | `/player/:id` fullscreen | ✅ |
| SettingsView | `/settings` | ✅ |
| DownloadsView | `/downloads` | ✅ |
| RemoteControlView | `/remote` | ✅ |
| **FavoritesView** | **无** | ⚠️ 已实现列表，无入口 |
| **AggregateView** | **无** | ⚠️ 占位页 |

> **后续修正注记（2026-05-26）**：`/favorites` 与 `/aggregate` 已在 `src/router/index.ts` 注册并可从侧栏进入。

### 3.2 孤儿 / 断裂组件

| 组件 | 问题 |
|---|---|
| `MpvBanner.vue` | 未挂载；调用 `api.detectMpv()` / `api.openExternal()` **后端不存在** |
| `TopBar.vue` | 未挂载；调用 `library.clearSearch()` **store 无此方法** |
| `GlassCard.vue` | 未引用 |

> **后续修正注记（2026-05-26）**：`MpvBanner` 已在 `App.vue` 挂载；`api.detectMpv()` / `api.openExternal()` 已有后端命令对应。

### 3.3 Pinia Stores（7）

auth · server · library · player · settings · downloads · notifications — 均已接入 App.vue 初始化与事件监听。

### 3.4 PlayerView.back()（G8）

```typescript
async function back() {
  await player.stop();  // ← 仍 await，非 fire-and-forget
  router.back();
}
```

> **后续修正注记（2026-05-26）**：当前实现为 fire-and-forget stop，再执行返回导航。

### 3.5 品牌字符串

| 字符串 | 出现次数 | 位置 |
|---|---|---|
| Emby Player（产品名） | 3 | Sidebar, Settings 关于, RemoteControl |
| Hills Lite | 1 | MpvBanner（未挂载） |

> **后续修正注记（2026-05-26）**：用户可见品牌文案已按 Hills Lite 对齐；本表保留审计当日统计值。

### 3.6 theme.css 缺口

`AggregateView.vue` 使用 `--surface-1`, `--accent-soft` — **theme.css 未定义**（若启用该页会样式缺失）。

---

## 4. 记忆 vs 实际 — 完整差距表

| ID | 记忆/规范 | 实际 | 严重度 |
|---|---|---|---|
| G1 | 品牌 Hills Lite | Emby Player | 低 |
| G2 | 收藏/聚合一级导航 | 视图存在，无路由/Sidebar | 中 |
| G3 | MPV 命名管道 IPC | fd://0 stdin/stdout | **高** |
| G4 | 内置 mpv.exe + build 复制 | 仅 fonts.conf | **高** |
| G5 | 只产 exe | bundle all | 低 |
| G6 | CHANGE_LOG | ✅ 已 bootstrap | — |
| G7 | PROJECT_MEMORY | ✅ 已 bootstrap | — |
| G8 | back() fire-and-forget | 仍 await stop | 中 |
| G9 | 打开闪退 | crash.log 待用户贴 | **高** |
| **G10** | detectMpv / MpvBanner | API 不存在，组件未挂载 | 中 |
| **G11** | 收藏功能 | 无 set_favorite；Detail 无 ♥ | 中 |
| **G12** | hardwareDecoding 等 | 设置项不传给 mpv | 低 |
| **G13** | 全量审计后再改 | ✅ 本报告 | — |

---

## 5. 用户已确认决策（2026-05-25 寸止）

| 项 | 决策 |
|---|---|
| mpv.exe | **不进 Git**；`build.rs` 从固定 URL 或本机路径复制 |
| 修改节奏 | **先全量审计确定状态，再开始改代码** |
| AI 权限 | 可生成总结文档、测试脚本、编译、运行 |

---

## 6. 建议修改顺序（审计后）

```
1. G9  闪退（需 crash.log）
2. G3  MPV IPC 命名管道（播放稳定性）
3. G4  build.rs 下载/复制 mpv（需确认 URL 与本机 fallback 路径）
4. G10 补 detect_mpv + 挂载 MpvBanner 或删除组件
5. G5  tauri.conf 只产 exe
6. G1+G2 品牌 + 路由/Sidebar
7. G11 收藏 API + Detail ♥ + Favorites 路由
8. G8  Player back fire-and-forget
9. G12 设置项接入 mpv 或从 UI 移除
```

---

## 7. 验证清单（改代码后）

- [ ] `npm run build` 前端无 TS 错
- [ ] `npm run tauri:build` Rust 编译通过
- [ ] exe 启动 → Sidebar → /home
- [ ] 登录 → 库 → 播放 → 返回
- [ ] crash.log 无新 panic
- [ ] 文档：CHANGE_LOG + CURRENT_STATE 同步更新

---

## 8. 相关文档

- [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)
- [`CURRENT_STATE.md`](./CURRENT_STATE.md)
- [`ROADMAP/gap-alignment.md`](./ROADMAP/gap-alignment.md)
- [`CHANGE_LOG/2026-05-25-0230-doc-standards-bootstrap.md`](./CHANGE_LOG/2026-05-25-0230-doc-standards-bootstrap.md)
