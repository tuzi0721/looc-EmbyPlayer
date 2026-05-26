# Hills Lite — 当前项目状态快照

> **更新时间**：2026-05-26（文档审计回写，对齐当前代码事实）  
> **规格**：[`UI_REFERENCE_HILLS_LITE.md`](./UI_REFERENCE_HILLS_LITE.md)  
> **变更日志**：[`CHANGE_LOG/2026-05-26-2330-doc-audit-sync.md`](./CHANGE_LOG/2026-05-26-2330-doc-audit-sync.md)

---

## 1. 概览

| 项 | 值 |
|---|---|
| 路径 | `A:\vsc\emby-player` |
| 显示名 | **Hills Lite** |
| 可执行文件 | `src-tauri\target\release\emby-player.exe` |
| 内置 mpv | `src-tauri\target\release\resources\mpv\mpv.exe`（build.rs 下载） |
| 强调色 | `#a855f7` |

---

## 2. UI 状态（Phase 1）

| 页面 | 状态 |
|---|---|
| Sidebar + TopBar + MpvBanner | ✅ 已接入 |
| 首页 / 收藏 / 聚合视界 / 媒体库 | ✅ |
| 详情页 Hero + 横滑选集 | ✅（演职人员 Phase 2，已隐藏空占位） |
| 播放页底栏 + 返回详情 | ✅（`back()` 为 fire-and-forget stop） |
| 设置页单列分组 | ✅ |

**注意**：当前 `tauri.conf.json` 已设置 `bundle.active: false` 与 `targets: []`，发布验证以 `src-tauri\target\release\emby-player.exe` 为准。

---

## 3. 播放与返回

- 详情 → 播放：`/player/:id?from=<detailId>`
- 播放返回：`/item/${from || SeriesId || id}`

---

## 4. MPV

- IPC 模式：命名管道 `\\.\pipe\hills-lite-mpv-{uuid}`
- error 123 已修复（`ServerOptions::create(&pipe_path)`）
- **2026-05-25**：离开播放页时 `embedDetach` 完整 teardown（shutdown mpv + DestroyWindow）
- **2026-05-25**：`ensure_started` 检测 mpv 进程存活，死亡自动重启

---

## 5. 验证 / 构建

```powershell
npm run build
npm run tauri:build
```

---

## 6. Phase 2 待办

- 详情页类型标签、集缩略图进度条
- 播放页网速开关
- 收藏/已看 API
- 演职人员数据
