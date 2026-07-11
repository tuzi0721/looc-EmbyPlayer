# Hills Lite 播放器 — 交接文档（2026-06-22）

> 用途：本会话已过长、插件渲染卡顿，故交接给新会话/新开发继续。照此文档可无缝接手。

---

## 0. 给新会话的第一条提醒（很重要）

- 本工作区用「晴天无限 QingTian MCP」持续对话（通道 `qtwx-mcp-1`）。
- **血泪教训**：
  1. `record_reply` 的 `content` **只能传极短摘要**（十几个字）。传大段正文/长 `\u` 转义会**卡死/搞崩用户插件显示**。完整正文留在 Cursor 对话窗口即可。
  2. **不要在回复里贴代码**（尖括号 `<>`、长片段等会搞崩插件显示）。改动直接写进文件，用大白话告诉用户「改好了，去构建测试」。
  3. 本会话历史已极长 → 插件渲染本身很卡。新会话从干净开始会好很多。

---

## 1. 项目结构

| 部分 | 路径 | 说明 |
|---|---|---|
| Electron 主进程 | `electron/main.mjs` | 启动/管理 Qt 播放器、IPC、shell 显隐、写 playback.log |
| 后端-Emby | `electron/backend/emby.mjs` | Emby API、流地址解析（`mpvPlaybackSource`）|
| 后端-设置 | `electron/backend/store.mjs` | 设置持久化、默认值 |
| 前端 Vue | `src/` | 外壳、媒体库、搜索、设置、播放 store |
| 播放 store | `src/stores/player.ts` | 播放状态、轮询、进度上报、自动下一集、清理 |
| 自研 Qt 播放器 | `player/` | C++/QML + libmpv，产物 `hills_player.exe` |
| Qt 入口/窗口 | `player/src/main.cpp` | argv 解析、窗口、stdin 控制、**崩溃捕获器** |
| Qt mpv 集成 | `player/src/mpv_object.cpp/.h` | libmpv 渲染 API → Qt FBO（**崩溃所在层**）|
| Qt argv | `player/src/argv_options.cpp` | `--fullscreen/--maximize/--geometry/...` |
| Qt stdin 控制 | `player/src/control_channel.cpp` | host→播放器 行 JSON |
| Qt UI | `player/qml/Main.qml` | 播放器全部 UI（顶/底栏、进度、菜单、弹幕）|

- 日志：`C:\Users\Sakur\AppData\Roaming\Hills Lite\playback.log`
- 状态/设置：`C:\Users\Sakur\AppData\Roaming\Hills Lite\state.json`

---

## 2. 【最高优先级】未解决：窗口 resize 崩溃

### 现象
窗口化下拖拽改窗口大小 → 播放器 `0xC0000005` 闪退 → 回退到 Electron 详情页（"Electron 反复出现"的真正来源）。

### 诊断证据（playback.log）
- `hills_exit code:3221225477` = `0xC0000005` 访问违例。
- 已在 `main.cpp` 装崩溃捕获器（向量异常处理 `hillsCrashHandler`），崩溃时输出：
  `[crash] ACCESS_VIOLATION ... in module '<unknown>' (base+0x...fd2e)`
  - `<unknown>` = 不在任何 DLL 的内存 = **GPU 驱动 JIT / 着色器编译代码**。
  - 每次崩在**同一偏移 `...fd2e`**（ASLR 换基址）= 同一个函数。
- 崩溃前日志：`d3d11va: Could not create device` → 回退 `nvdec/CUDA`；`Video source: 0x0` 退化几何；崩溃发生在 `mpv_render_context_render` 期间、resize 时。

### 已排除（都试过、仍崩）
- **hwdec**：`auto-safe` / `auto-copy` / `no`（纯软解）都崩 → 不是硬解/CUDA 互操作。
- **FBO**：动态重建 / `textureFollowsItemSize=false` 固定屏幕尺寸 都崩 → 不是 FBO 重建。
- **profile=fast**（最简着色器）仍崩 → 不是着色器复杂度。
- **显卡驱动**：用户新旧驱动都崩（已 DDU 更新）→ 不是驱动版本。

### 结论
崩溃是「libmpv 渲染 API → Qt Quick FBO → 窗口 resize」这套架构踩到 GPU 驱动 bug。我们能配置的渲染层级已调完。

### 当前已写入文件、但**尚未编译验证**的修复（手术刀方案）
**思路**：resize 手势期间暂停 mpv 渲染（不调用会崩的 `mpv_render_context_render`），尺寸稳定 180ms 后恢复。
**改动文件**：
- `player/src/mpv_object.h`：
  - 加 `#include <QTimer>`、`#include <atomic>`。
  - 加 `protected: void geometryChange(const QRectF&, const QRectF&) override;`
  - 私有成员加 `std::atomic<bool> m_resizing{false};` 与 `QTimer *m_resizeSettleTimer = nullptr;`
- `player/src/mpv_object.cpp`：
  - 构造函数里创建 `m_resizeSettleTimer`（单次、180ms），超时回调置 `m_resizing=false` 并 `update()`。
  - 实现 `geometryChange`：尺寸变化时 `m_resizing=true` + 重启定时器。
  - `MpvRenderer::render()` 开头：`if (m_obj->m_resizing.load()) return;`（拖拽期间跳过渲染）。
**状态**：代码已写入；**编译验证被会话卡顿打断，未确认是否编译通过**。
**接手第一步**：重新编译确认（见第 6 节命令），过了就打包，让用户拖拽测试。
**验证**：窗口化反复拖拽改大小，看是否还崩。代价：拖拽时画面短暂定格/黑，松手即恢复（可接受）。
**若仍崩**（说明手术刀无效）：走「播放器视频输出定点重构」——改为 mpv **原生窗口输出**（`vo=gpu-next`，mpv 自管窗口与 resize），控件用透明覆盖层。**不要重写整个 app**（外壳/功能都正常）。这是用户已同意的兜底方向。

### 另：诊断设施保留
- `main.cpp` 的崩溃捕获器保留（继续定位用）。
- `mpv_object.cpp` 里 `mpv_request_log_messages(m_mpv, "warn")` 保留；调试时可临时提到 `"v"`（但会刷屏、变慢，测完要降回）。

---

## 3. 本会话已完成并交付的修复（已验证、在历史包里）

播放器（Qt，需重编生效）：
- 全屏起播不再闪 Electron 页（点击瞬间实时确认自研播放器）；全屏起播无缝（`--fullscreen` 真全屏，不再窗口化闪一下）。
- 自动播放下一集（修了"自然结束→Qt 退出→standalone_closed 抢在续播前清队列"的竞态；事件驱动续播 + 续播窗口期内不恢复 shell）。
- 网速只显示数字、去紫色折线；左上角不显示 stream/mediaSourceId；进度条加高+加判定区（防误暂停）、滑块加大；去顶部阴影遮罩、淡化底部阴影；播放器内 PRO 角标去除。
- 最大化按钮一键回窗口化（全屏/最大化都直接回，修"要点两次"）。

界面/设置（Vue）：
- 删「聚合视界」；首选音频/字幕语言加「中文繁体」；删 pro/高级/新 小标签（仅留云端账号 PRO）。
- 核实后删「窗口亚克力效果」「心跳保号周期」（**死设置、无接线**）；**保留**「模糊强度」（控 `--glass-blur`，有用）与「标准/巨幕」（图片分辨率+影院版排版差异，有用）。
- 快捷键面板：去矩形底框、「录制」→「自定义」。
- 添加服务器端口栏文案精简为「端口（可选）」。
- 黑暗模式海报阴影减轻；设置全屏右侧留空（内容宽度上限 1180→1480）；通知中心头部下移避开窗口按钮；全屏>48 项无法下滚已修（VirtualGrid `scrollbar-gutter:stable` + `overflow-x:hidden`）。
- 搜索改为只搜本服务器（`api.search` 取代 `searchAllAccounts`）、结果两栏（剧集/影片在上、单集在下）。
  - 注：曾加「退出搜索」按钮，后按用户要求**撤掉**（搜索框自带 x）。
- 设置底部加「激活码 / 卡密」入口（构建期不做真实校验，仅本地记录提示）。
- 默认硬解改 `hwdec=no`（软解），因这台机 GPU 互操作不稳；设置里「自动」也不下发硬解覆盖（`main.mjs` hwdec 逻辑：只有用户显式选 d3d11va/vulkan/copy 才下发）。

---

## 4. 剩余待办（大功能，未做）

1. **选集 / 版本切换 / 清晰度**（最大块，需双向协议）
   - 现状：`Main.qml` 里「选集」「版本」按钮只 `win.hostAction(...)` → toast「已交由宿主处理」，是 **stub**。
   - 现有协议：
     - 播放器→宿主：stdout `HILLS_MPV_EVENT:{json}`；`uiAction(action)` 发 `{"event":"ui-action","action":...}`。
     - 宿主→播放器：stdin 行 JSON，`control_channel.cpp` 的 `dispatchControl`：`loadfile/play/pause/seek/set-audio/set-sub/add-sub/set-property/set-speed/set-volume/anime4k/command/quit`。
   - **缺口**：`main.mjs` 的 `attachHillsPlayerHandlers` 目前**不处理 `ui-action` 事件**，需新增；还需新增 stdin 动作把"剧集/版本列表"推进播放器、QML 渲染面板、回选→宿主重载（`playerStore.play(选中项)`）。
   - JS 侧已有数据：`DetailView.vue` 的 `episodes`、`playerStore` 的 queue；版本=Emby 多 MediaSource（`mediaSourceId` 切换）。
   - ⚠ 此功能**必须实机往返测**，不能盲建。

2. **云账号移到添加服务器界面 + 云端导入**（pro，构建期免验证）：登录流程改造。相关：`src/stores/cloud.ts`、`src/components/login/AddServerDialog.vue`、`SettingsView.vue` 云端区。

3. **海报缓存可调（默认 1G + LRU 自动释放）**：
   - 磁盘图片缓存在 `userDataDir/image-cache`（`main.mjs` `imageCacheDir`，`writeImageCacheEntry`/`readImageCacheEntry`）。
   - 需加设置 `imageCacheLimitMB`（默认 1024）+ 写入后/启动时按 mtime 做 LRU 淘汰到上限。
   - `get_cache_usage`/`clear_app_cache` 目前只统计 Chromium session 缓存，应纳入磁盘 image 缓存。
   - 海报"加载慢"诊断：客户端已是 320/640 宽 webp q82 + 8 路分片 + 磁盘缓存；首屏慢大概率是**服务器端实时缩放+webp 重编码**。需让用户确认"第二次进同页是否秒出"来区分服务器侧 vs 缓存 bug。

---

## 5. 用户环境 / 服务器备忘

- 机器：3080（+ 一堆服务器硬件，另见之前硬件排障：MZ32-AR0 整批"吃卡/不认卡"，结论是批次 PCIe 兼容缺陷，与本播放器无关）。
- Emby 服务器：
  - `ciallo.party`：自建硬盘直连（http 直链，正常）。
  - `yl1`：正常。
  - `myd`（115 网盘 strm）：曾做畸形 308 跳转解码，**后因价值低已回退**；需本机 115 助手（`127.0.0.1:7811`）才能出流，用户本机没跑。
- 部分 mkv 文件本身轻微损坏（日志有 `mkv: Corrupt file detected. resync`），是文件问题、加载仍成功，与崩溃无关。

---

## 6. 构建命令（用户自己跑是秒成的；AI 跑曾导致卡死，优先让用户跑）

```powershell
cd A:\vsc\emby-player
$env:PATH="A:\QtMingw\Tools\mingw1310_64\bin;A:\QtMingw\6.8.3\mingw_64\bin;"+$env:PATH

# 1) 编译 Qt 播放器（约 10-20s）
cmake --build player\build

# 2) 拷贝产物到资源目录
Copy-Item player\build\hills_player.exe src-tauri\resources\player\hills_player.exe -Force

# 3) 前端 + Electron 打包
npm run build
$env:ELECTRON_BUILDER_CACHE='.electron-builder-cache'
npx electron-builder --win dir
```

- 产物：`release-electron\win-unpacked\Hills Lite.exe`
- 包里播放器：`release-electron\win-unpacked\resources\player\hills_player.exe`
- 工具链：cmake/ninja 在 PATH；mingw `A:\QtMingw\Tools\mingw1310_64\bin`，Qt `A:\QtMingw\6.8.3\mingw_64\bin`（仓库内另有 `A:\vsc\toolchain\qt\6.8.3\mingw_64`）；`player\build` 已配置，增量 `cmake --build player\build` 即可。

---

## 7. 接手建议顺序

1. 先 `cmake --build player\build` 确认第 2 节的"resize 暂停渲染"修复**能编译**（若有编译错先修）。
2. 打包，让用户**窗口化拖拽**测崩溃。
   - 不崩 → resize 崩溃根治（接手最大胜利）。
   - 仍崩 → 上"mpv 原生窗口输出"定点重构（第 2 节兜底）。
3. 崩溃稳定后，再单独一轮做「选集/版本/清晰度」双向协议（第 4.1 节）。
4. 全程：record_reply 只发短摘要、回复不贴代码（第 0 节）。
