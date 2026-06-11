# 2026-06-11 13:00 自研播放器接入 CH-2 SVG 图标 + 可视化验收（T9b）

## 背景
T9b 播放页此前用 Unicode 字符做控件占位，等待 CH-2 图标集。CH-2 已交付 20 枚
Material 风格 24×24 SVG（线性白色单色，激活态紫色 #7C4DFF）。本次把图标接入真实
播放器工程并完成首次 Qt6 重建 + 可视化验收。

## 变更
### 图标资产归位
- CH-2 把图标存到了工作区根 `player/qml/icons/`（相对路径错位），实际工程在
  `emby-player/player/`。本次将 20 枚 SVG 拷入 `emby-player/player/qml/icons/`（规范位置）。

### `player/CMakeLists.txt`
- `qt_add_qml_module` 新增 `RESOURCES`，用 `file(GLOB ... qml/icons/*.svg)` 把图标编入
  QML 模块资源，使 `Main.qml` 可用相对路径 `icons/<name>.svg` 引用（开发态读盘、发布态读
  编译进 exe 的 qrc 均一致）。

### `player/qml/Main.qml`
- `CtrlButton` 组件升级：新增 `iconSource`/`iconSize` 属性，有图标时渲染 `Image`
  （`sourceSize` 矢量缩放、抗锯齿、悬停/激活提亮），无图标时回退到 `glyph` 文本。
- 逐个接线：
  - 顶栏：返回 `back.svg`、置顶 `pin.svg`/`pin-active.svg`（按 `pinned` 切换，激活态紫色）、
    最小化/最大化/关闭 `minimize/maximize/close.svg`（窗口控制 Repeater 改用 Image）。
  - 底部 transport：上一集 `prev.svg`、播放/暂停 `play.svg`/`pause.svg`（按 `paused` 切换）、
    下一集 `next.svg`、音量/静音 `volume.svg`/`volume-muted.svg`。
  - 右侧簇：版本 `version.svg`、音轨 `audio-track.svg`、字幕 `subtitle.svg`、弹幕 `danmaku.svg`、
    设置 `settings.svg`、选集 `playlist.svg`、全屏 `fullscreen.svg`。
  - 倍速按钮保留数字文本（显示当前倍速，信息量优于图标）。

## 验证
- **已编译**：本机工具链（Qt 6.8.3 mingw_64 + MinGW 13.1 + Ninja + libmpv-dev）增量重建
  `hills_player.exe` 绿；图标随 `qt_add_qml_module` RESOURCES 编入资源（rcc 步骤通过）。
- **可视化验收 PASS**：以 `av://lavfi:testsrc2` 合成源 + `--force-window --pause` 起播截图
  （`player/build/player-ui-icons.png`），顶栏/transport/右侧簇全部图标正确渲染、进度条紫色
  圆 thumb 正常、播放/暂停按状态切换图标。
- CMake 提示 QTP0004（图标子目录无 qmldir）为无害开发者警告，不影响构建/运行。

## 残余
- 标题/弹幕原生覆层仍未实现（下一步接 IPC 注入）。
- 静音图标状态用本地布尔跟随点击，未绑定 mpv `mute` 外部变化（视觉验收足够，后续可绑定属性）。
- 设置页 1:1 复刻（5 张截图规格）待落地。
- 真机带负载最终验收（T10）待用户提供 Emby 直链。
- 工作区根 `player/qml/icons/`（CH-2 错位副本）保留未删，规范位置已迁至 `emby-player/player/qml/icons/`。
