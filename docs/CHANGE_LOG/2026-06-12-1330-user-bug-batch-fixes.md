# 2026-06-12 13:30 用户实测 Bug 批量修复（CH-1）

## 背景
用户用 11:35 win-unpacked 包实测后反馈 6 个问题（截图 3 张）：
1. 详情页主标题是纯文字，期望与首页巨幕一致显示艺术标题（Logo）。
2. 首页巨幕仍是「先显示文字标题、Logo 加载后才覆盖」的闪烁。
3. 媒体库海报加载慢，希望加大并发。
4. 部分详情页提示「损坏」（加载失败类错误）。
5. 左上角应用图标 + 产品名称要去掉。
6. 暗色情况下导航栏 / 详情页仍是白色。
7. 播放一直卡在「加载中」。

## 根因与变更

### 详情页艺术标题（views/DetailView.vue）
- 新增 `titleLogoUrl`（`mediaItemImageUrl(..., "Logo", 900)`，含父级/剧集 Logo 回退）+
  `titleLogoLoaded/Failed` 状态；模板在 `hero__title` 前插入 `.hero__logo`，
  有 Logo 候选时立即视觉隐藏文字标题（clip 方式保留无障碍），Logo 淡入；失败则回退文字。
  行为与 HeroCarousel 一致。

### 首页巨幕标题闪烁（components/common/HeroCarousel.vue，本批前已改）
- `hero__title--with-logo` 条件从 `logoLoaded` 改为「有 Logo 候选即隐藏」，并预加载 Logo，
  消除「先文字后 Logo」闪烁。

### 海报并发（utils/mediaImages.ts + PosterCard.vue + electron/main.mjs，本批前已改）
- `hills-image://` 协议 host 分片为 `media0..media7`，绕开 Chromium 每 host ~6 并发限制；
  main 进程 `parseImageProtocolUrl` 用 `/^media\d*$/` 等价接受。
- PosterCard 预加载边距 300px→800px，`loading="lazy"`→`eager`（可见性已由 IO 控制）。

### 部分详情「损坏」提示（views/DetailView.vue）
- 代码中无「损坏」字面文案，对应实际为「详情数据解析失败/加载失败」错误面板，
  或渲染期崩溃。修复已知崩溃类：`Genres[]` / `GenreItems[].Name` / `Studios[].Name`
  非字符串时 `.trim()` 抛 TypeError 导致整页损坏 → 统一 `String()` 强转（与 trimId 同类防御）。
- 服务端 JSON 解析失败类错误需用户提供错误详情原文进一步定位。

### 去掉左上角图标/名称（electron/main.mjs + AppSidebar/TopBar，本批前已改）
- `titleBarStyle: "hidden"` + `titleBarOverlay`（原生标题栏隐藏，仅保留窗口控制按钮），
  sidebar 品牌按钮移除，TopBar/品牌区作为拖拽区。

### 暗色下导航栏/详情页白色（stores/settings.ts + electron/main.mjs + SettingsView.vue）
- 实测包持久化 `theme: "light"`，且旧「Auto」并不跟随系统（恒等于暗色 CSS）。
- settings.ts：`auto` 现在通过 `matchMedia(prefers-color-scheme)` 跟随系统并实时响应切换。
- electron/main.mjs：`applyWindowTheme` 对 `auto` 设 `nativeTheme.themeSource="system"`，
  overlay 颜色按 `shouldUseDarkColors` 解析；监听 `nativeTheme.updated` 同步 overlay。
- SettingsView：「Auto」文案改为「跟随系统」。
- 用户侧操作：设置 → 通用 → 主题模式选「深色」或「跟随系统」。

### 播放卡「加载中」（electron/backend/mpv.mjs + views/PlayerView.vue）
- 实测日志坐实根因：`mpv.log` 显示 HTTPS 流在 ~6.4MiB 后停滞，ffmpeg 默认 60s 超时内
  无任何反馈，UI 无超时机制 → 永久转圈。
- mpv.mjs：新增 `--network-timeout=12` + `--stream-lavf-o=reconnect=1,
  reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=4`，
  停滞连接 12s 内失败并带 Range 重连续传。
- PlayerView：为内嵌 mpv 路径新增 45s 加载看门狗（对齐 HTML 路径 30s 看门狗），
  超时显示可重试错误而非永久转圈；出帧/卸载时清除。

## 验证
- `npm run build` 全绿（check:local-decode 159 文件 / check:no-planned-ui 81 文件 /
  vue-tsc / vite 6.6s）。
- ReadLints 无错误。
- `npm run electron:build` 重新打包 win-unpacked。

## 残余
- 「部分详情损坏」若为服务端 JSON 解析失败（非渲染崩溃），需要用户贴错误详情原文定位。
- Electron 路径仍无 Tauri 的 stream proxy / mp4 prefetch，弱网线路健壮性长期项。
