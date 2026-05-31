# 2026-05-30 00:45 Electron 图片缓存

## 目标

把在线媒体图片从分散直连改为可缓存的统一入口，降低列表、首页 Hero、详情页和播放页反复加载海报/背景图时对远端服务的压力。

## 变更

- 新增 `src/utils/mediaImages.ts`，统一生成 Emby/Jellyfin 图片 URL；Electron 环境走 `hills-image://`，Web/Tauri 继续回退到原远端 URL。
- Electron 主进程注册 `hills-image` 协议，按服务器、线路、ItemId、图片类型和尺寸参数生成缓存键，命中 `.electron-user-data/image-cache` 时直接返回本地缓存。
- 缓存未命中时，Electron 使用当前账号 token、线路 UA 和自定义 headers 拉取图片，写入磁盘缓存后回传给渲染层。
- `PosterCard`、首页 `HeroCarousel`、详情页图片和播放页背景/海报改为复用统一图片入口。

## 验证

已通过：

```powershell
node --check electron\main.mjs
hills-image / mediaImages / 直接拼接图片 URL 落点检查
行尾空白检查
npm.cmd run electron:build
npm.cmd run build
浏览器冷开 http://127.0.0.1:1420/
```

说明：`npm.cmd run build` 首次触发既有 Vite HTML 偶发错误，随后重跑通过；`npm.cmd run electron:build` 通过，Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。浏览器冷开空数据 shell 正常，无应用自身新增 console/page error；本机当前无真实已配置媒体服务器，未做真实图片缓存命中/未命中抓包验证。

## 当前状态

- Electron UI 图片会优先经过应用内磁盘缓存协议。
- Web/Tauri 预览仍保持原有直连图片路径。
- 系统媒体缩略图仍保留远端 URL，避免 OS 侧无法识别应用内自定义协议。
