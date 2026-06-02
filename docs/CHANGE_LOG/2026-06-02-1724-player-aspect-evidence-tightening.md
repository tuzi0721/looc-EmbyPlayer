# 2026-06-02 17:24 Player aspect evidence tightening

## 背景
- 用户指出上一轮所谓“真实画面”比例明显不对，不能把这类截图当作播放通过证据。
- 复核后确认：页面截图可能只捕获 DOM 层或海报兜底；即使 native 截图真实，按亮色像素估内容框也会被暗场镜头误导。

## 本阶段变更
- Electron mpv snapshot 新增 `videoOutParams`、`osdDimensions`、`keepaspect`、`panscan`、`videoZoom`、`videoScaleX`、`videoScaleY`、`videoAspectOverride`，让测试能读取 mpv 自己报告的输出比例和当前画面模式。
- 真实服务器 visual smoke 的比例断言改为优先检查 mpv `video-out-params` 与 `osd-dimensions` 内容框比例；截图像素检查只负责证明 native/mpv 窗口不是黑屏，不再用暗场亮色区域推断画面比例。
- 多尺寸播放器 resize 检查现在会把每个窗口尺寸下的 aspect evidence 和 native 窗口来源写入阶段输出。

## 验证状态
- 本阶段刚完成代码与脚本修正，尚未宣称播放器比例通过。
- 下一步立即执行语法检查、前端构建、本地 embedded smoke，然后用真实账号重跑多尺寸 visual smoke 并人工视检 native/mpv 截图。
