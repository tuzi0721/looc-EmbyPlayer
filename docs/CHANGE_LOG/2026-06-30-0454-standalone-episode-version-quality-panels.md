# 2026-06-30 04:54 自研播放器「选集 / 版本 / 清晰度」双向链路（CH-1）

## 背景
`player/qml/Main.qml` 的「版本」「选集」按钮原是 stub（`win.hostAction` → `mpv.uiAction(action)`
+ toast「已交由宿主处理」），「清晰度」连按钮都没有；`electron/main.mjs` 的
`attachHillsPlayerHandlers` 不处理 `ui-action`，所以这些意图到了宿主就断了。

本次补完用户要求的整条往返链路：
> host 收到 ui-action(episodes/versions/quality) → 把剧集/版本/清晰度列表经 stdin 推给播放器
> → QML 渲染面板 → 回选 → 用 playerStore.play(选中项) 重载。

窗口 resize 崩溃：本机无法复现，本轮按用户指示**暂不处理**。

## 协议（双向）
- 播放器→宿主（stdout `HILLS_MPV_EVENT:`）：
  - `{"event":"ui-action","action":"episodes|versions|quality"}` 请求面板
  - `{"event":"ui-action","action":"panel-select","data":{"kind","key"}}` 回选
  - 既有 `next-episode/prev-episode` 现真正接线
- 宿主→渲染端（app event）：`player:request_panel{kind}`、`player:panel_select{kind,key}`；
  `next-episode→player:next_track`、`prev-episode→player:prev_track`
- 渲染端→宿主（IPC）：`hills_player_set_panel{panel}`
- 宿主→播放器（stdin）：`{"action":"show-panel","panel":{kind,title,entries:[{key,label,sublabel,checked}]}}`

## 变更
### 播放器 C++（`player/src/`）
- `reporter.{h,cpp}`：`uiAction(action, data=QJsonObject())`，非空时带 `"data"` 字段。
- `mpv_object.{h,cpp}`：`uiAction(action, data=QVariant())`（JS 对象→QVariantMap→QJsonObject）；
  新增信号 `hostPanelRequested(QVariant)` + `Q_INVOKABLE showHostPanel(panel)`。
- `main.cpp` `dispatchControl`：新增 `show-panel` 分支 → `mpv->showHostPanel(panel.toVariantMap())`。

### 播放器 QML（`player/qml/Main.qml` + 图标）
- 版本/选集按钮改为 `mpv.uiAction("versions"|"episodes")`（去 toast）；新增「清晰度」按钮
  `mpv.uiAction("quality")`，右簇顺序：倍速·版本·清晰度·音轨·字幕·弹幕·设置·选集·全屏。
- 三个按钮加 id（versionBtn/qualityBtn/episodesBtn）作面板锚点。
- 新增 `win.showHostPanel(panel)` + 共享 `hostMenu`（PlayerMenu，entryWidth 320）；
  `MpvObject.onHostPanelRequested` 映射条目，回选 `mpv.uiAction("panel-select",{kind,key})`。
- 新图标 `player/qml/icons/quality.svg`（CMake 用 glob 自动纳入 QML 资源，无需改构建）。

### 宿主（`electron/main.mjs`）
- `attachHillsPlayerHandlers` 新增 `ui-action` 分支：next/prev→track 事件；episodes/versions/
  quality→`player:request_panel`；panel-select→`player:panel_select`。
- 新增 IPC 命令 `hills_player_set_panel`：运行中时 `sendCommand({action:"show-panel",panel})`。

### 渲染端（`src/`）
- `api/index.ts`：`setPlayerPanel(panel)` → `hills_player_set_panel`。
- `App.vue`：监听 `player:request_panel`/`player:panel_select`。
  - 组装：`api.getItemDetail(player.itemId)` 取 SeriesId/SeasonId/MediaSources；
    剧集用 `api.listEpisodes`，版本=各 MediaSource，清晰度=按视频高度去重（无转码约束下映射到对应源）。
  - 回选：剧集→重建队列（`setQueue` 从选中集往后）+ `player.play({itemId,startMs})`；
    版本/清晰度→`player.play({itemId,mediaSourceId,startMs:当前进度})`，原位续播。

## 海报缓存 LRU（默认 1GB）
- `store.mjs`：默认 `imageCacheLimitMB: 1024`（0=不限）。
- `main.mjs`：`enforceImageCacheLimit()` 按 mtime 升序淘汰到上限 90%（迟滞），
  `writeImageCacheEntry` 后防抖触发、启动时跑一次；`readImageCacheEntry` 命中时 `utimes` 刷新
  mtime（真·LRU）。设置页「缓存」区加「海报缓存上限（MB）」输入。
- 注：HANDOVER 称 `get_cache_usage/clear_app_cache` 只统计 Chromium 缓存——现已含磁盘图片缓存（早前已修），本轮只补上限+淘汰。

## 验证
- `npm run build` 全绿：check:local-decode（162）/check:no-planned-ui（84）/vue-tsc 无错/vite 6s。
- `node --check` main.mjs / store.mjs / preload.mjs 通过；ReadLints 无错误。
- C++/QML **已用本机工具链编译通过**（见下）：`hills_player.exe` 1,299,753 B / 2026-06-30 05:01，
  已覆盖到 `src-tauri/resources/player/hills_player.exe`（旧版 6/24）。exe 内确认含
  show-panel / quality / versions / hostPanelRequested；`Main.qml` 经 qmlcachegen 编译无错。
- 尚缺：实机往返测（需打 Electron 包后运行）。

## 本机工具链（重建用）
- 全在 `E:\vsc\toolchain`：mingw 13.1.0、Qt 6.8.3 mingw_64、mpv-dev（含头+libmpv.dll.a）、
  CMake 3.30.5、Ninja 1.12.1、QWindowKit 源码。
- 重建命令：
  ```
  $env:PATH='E:\vsc\toolchain\tools\Tools\mingw1310_64\bin;E:\vsc\toolchain\qt\6.8.3\mingw_64\bin;E:\vsc\toolchain\tools\Tools\CMake_64\bin;E:\vsc\toolchain\tools\Tools\Ninja;'+$env:PATH
  cmake -S player -B player/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="E:/vsc/toolchain/qt/6.8.3/mingw_64" -DMPV_ROOT="E:/vsc/toolchain/mpv-dev" -DFETCHCONTENT_SOURCE_DIR_QWINDOWKIT="E:/vsc/toolchain/qwindowkit-src"
  cmake --build player/build
  Copy-Item player\build\hills_player.exe src-tauri\resources\player\hills_player.exe -Force
  ```
- `src-tauri/resources/player` 已含完整 Qt 运行时（platforms/qml/QWK/libmpv 等），仅换 exe 即可。

## 残余 / 接手第一步
1. 打 Electron 包：`npm run build` → `npx electron-builder --win dir`（HANDOVER 路径）。
2. 实机往返测：选集/版本/清晰度面板弹出、回选重载、上一集/下一集；多 MediaSource 项验版本，
   单源项验「清晰度只一条=原画」。
3. 清晰度在无转码约束下=分辨率变体映射到 MediaSource；若某项无多分辨率源，仅显示当前画质（符合预期）。
