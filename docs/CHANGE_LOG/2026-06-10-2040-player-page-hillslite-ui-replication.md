# 2026-06-10 20:40 自研播放器播放页 1:1 复刻 HillsLite UI（T9b）

## 背景
按用户指令复刻 HillsLite 播放页 UI 与功能（规格：`docs/UI_REFERENCE_HILLS_LITE.md` 图2/3）。
分工调整后由 CH-1 实现，CH-2 仅负责图标资产（已另发需求单）。

## 变更
### `player/qml/Main.qml`（重写）
- 主题：深色 + 紫色强调（#7C4DFF），进度条紫色已播放段 + 圆形 thumb，左时间/右总时长。
- 顶栏：左上返回 `‹`（emit `ui-action:back` 并关窗，宿主负责回详情页）+ 大标题
  （`file-loaded` 后取 mpv `media-title`）；右上：网速 MB/s + 折线（Canvas sparkline，
  默认隐藏，设置菜单开关，数据源 mpv `cache-speed` 1s 轮询）、置顶图钉
  （`WindowStaysOnTopHint`，激活紫色）、最小化/最大化/关闭。
- 底部 transport（左）：上一集 · 播放/暂停 · 下一集 · 音量（静音切换 + 滑条）。
- 底部右侧八控件（规格顺序）：倍速(菜单 0.5–2.0x，按钮显示当前倍速) · 版本 · 音轨
  （mpv `track-list` 实时枚举勾选）· 字幕（枚举 + 关闭字幕）· 弹幕 · 设置(齿轮菜单) ·
  选集 · 全屏。
- 齿轮菜单：缩放模式(适应/填充/拉伸/原始，keepaspect/panscan/video-unscaled) ·
  Anime4K(预设来自 C++ `anime4k.presets`) · 跳过片头/片尾 · 字幕设置(延迟±0.5s/字号±/重置) ·
  弹幕设置 · 统计信息(mpv stats 切换) · 显示网速开关。
- 宿主域动作（版本/选集/弹幕/跳过设置/上一集/下一集/返回）经新 `ui-action` 事件上抛 + toast 提示。
- 快捷键：Space/F/Esc/←→(±5s)/↑↓(音量±5)。

### C++（小幅，配套）
- `MpvObject::getProperty(name)`：mpv node→QVariant 通用读取（track-list/media-title/
  cache-speed/mute/sub-delay…），mpv-examples/qml 规范写法。
- `MpvObject::uiAction(action)` + `Reporter::uiAction`：stdout 上抛
  `{"event":"ui-action","action":...}`；宿主解析器对未知事件忽略，向前兼容。

## 验证
- 本机无 Qt 工具链：**未编译/未可视化验证**（QML 编进 exe，需 Qt6 环境重建后由 QA 截图验收）。
- 设计自检：无 4 位以上 `\uXXXX` 非法转义；Anime4K 属性名与 C++ (`preset/presets`) 对齐；
  音量滑条无绑定环；菜单悬停/勾选/弹出位置（按钮上方）符合规格。
- 既有门禁不受影响（player/ 不在 npm/cargo/检查脚本扫描范围）。

## 残余
- 图标为 Unicode 占位，待 CH-2 SVG 图标集替换。
- 弹幕渲染层（播放器内原生覆层）未实现，按钮经 ui-action 交宿主；后续接 IPC 注入。
- FluentUI(zhuzichu520) 组件库未引入（构建依赖较重），当前为手写深色样式，观感对齐规格。
- Qt6 环境重建 + 真机可视化验收（QA）。
