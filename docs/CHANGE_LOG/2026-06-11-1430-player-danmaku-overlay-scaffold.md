# 2026-06-11 14:30 自研播放器弹幕原生覆层·脚手架（T9b/item3，方案 A）

## 背景
复刻 HillsLite「播放器内原生弹幕覆层」。采用方案 A：宿主把弹幕写成 JSON 文件，
argv 传 `--danmaku-file=<path>`，播放器在 QML 里按播放进度渲染弹幕（类比 `--sub-file`）。
本批落地**播放器侧脚手架**并完成可视化验证；宿主侧自动喂数据为后续切片。

## 数据格式
JSON 数组：`[{ "t": <秒>, "text": "...", "mode": "scroll|top|bottom", "color": "#RRGGBB" }]`。
文件按 UTF-8 读取（中文正常，不受 argv 编码限制）。

## 变更（player/）
- `src/argv_options.{h,cpp}`：新增 `danmakuFile` + 解析 `--danmaku-file`。
- `src/main.cpp`：`loadDanmaku()` 用 QJsonDocument 解析文件为按时间排序的 QVariantList，
  在 `loadFromModule` 前经 `rootContext` 暴露为 `hillsDanmaku` / `hillsDanmakuEnabled`。
- `qml/Main.qml`：新增弹幕覆层 `danmakuLayer`（视频之上、控件之下）：
  - 滚动弹幕：`Component` + `createObject`，右→左 `NumberAnimation`，分轨（round-robin，
    lane 数按高度/字号自适应），离屏自动 destroy；时长按宽度+字宽与 speedFactor 计算。
  - 顶/底静态弹幕：居中显示约 4.5s 后 destroy。
  - 驱动：`Connections` 监听 `mpv.positionChanged`，游标推进生成到点弹幕；seek 回退则重置游标；
    跳过远超 1s 的过期弹幕避免 seek 爆发。
  - 「弹幕」按钮改为切换本地覆层显隐（`danmakuLayer.danmakuOn`）+ 上抛 `ui-action:danmaku`，
    按钮激活态随之高亮。

## 验证
- 本机工具链增量重建 `hills_player.exe` 绿。
- 可视化验收 PASS：以 `testsrc2` + `--danmaku-file=<demo.json>` 起播截图
  `player/build/player-danmaku.png`——滚动弹幕分轨右→左飘过、颜色生效、中文正常、描边清晰，
  顶部/底部静态弹幕居中显示，随进度生成。

## 残余（后续切片）
- 宿主侧（T9c/standalone）把弹幕数据（dandanplay/XML→JSON）写临时文件并在 `build_args` 注入
  `--danmaku-file`；接现有弹幕开关与弹幕设置（字号/透明度/速度/粗体/分区行数）。
- 滚动弹幕轨道碰撞避让（当前 round-robin，未按时间精确防重叠）。
- 与「弹幕设置」面板（字号/透明度/速度等）联动（当前用脚手架默认值）。
