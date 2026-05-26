# Phase 1 — Hills Lite UI 复刻（2026-05-25）

## 目标

按用户提供的 Hills Lite 参考截图，1:1 复刻基础 UI 与导航逻辑，删除无用代码，保证 MPV 可播放。

## 已完成

| 模块 | 变更 |
|---|---|
| **MPV IPC** | Windows 命名管道 `\\.\pipe\...` 修复 os error 123 |
| **rustls** | 进程级 `CryptoProvider` 安装，修复 WebSocket 启动 panic |
| **品牌** | Hills Lite + 紫色强调色 `#a855f7` |
| **Sidebar** | 首页/收藏/聚合视界、服务器区（绿播放+减号）、Pro、添加、设置 |
| **TopBar** | 全局居中搜索 |
| **首页** | Hero 轮播、继续观看横滑、媒体库磁贴 |
| **详情页** | Hero 背景、继续播放、三下拉、横滑选集、演职人员占位 |
| **播放页** | 底栏控件顺序；返回详情（`from` query）；设置弹出菜单 |
| **设置页** | 单列分组列表（替代左右分栏） |
| **清理** | 删除未使用的 `GlassCard.vue` |

## 关键文件

- `docs/UI_REFERENCE_HILLS_LITE.md` — UI 规格
- `src/views/DetailView.vue`
- `src/views/PlayerView.vue`
- `src/views/SettingsView.vue`
- `src-tauri/src/mpv/ipc.rs`

## 播放返回逻辑

详情页进入播放时携带 `?from=<detailId>`；播放页返回：

```
/item/${from || SeriesId || id}
```

## 打包与运行

```powershell
cd A:\vsc\emby-player
npm run tauri:build
.\src-tauri\target\release\emby-player.exe
```

> 仅 `cargo build` 不会更新前端 `dist`，必须跑 `tauri:build`。

## 已知差距（Phase 2）

- 详情页类型标签、进度条缩略图等细节
- 播放页网速显示（需设置开关 + 后端字段）
- 收藏/已看/分享按钮 API 对接
- PRO 功能占位接内核
- 演职人员数据拉取

## 验证清单

- [ ] 侧边栏无「下载/遥控/通知」入口
- [ ] 详情页为 Hero + 横滑选集（非竖排 glass 卡片）
- [ ] 播放失败不再出现 pipe error 123
- [ ] 播放返回回到详情页
