# 2026-06-02 19:15 Native child host default

## 背景
- 用户用真实窗口截图指出上一轮播放器证据不成立：mpv 画面出现在 Hills Lite 窗口外侧，属于 overlay 漂浮窗口，不是内嵌播放。
- 因此 17:48 的完成审计结论作废；后续不能再把进程树内可见 `mpv.exe` 外部窗口当作内嵌通过证据。

## 改动
- Electron 默认播放宿主从 overlay 改为 `--wid` native child；只有显式设置 `HILLS_ELECTRON_MPV_WID=0` 才会退到旧 overlay 调试路径。
- `HILLS_ELECTRON_MPV_NATIVE_CHILD` 默认启用；只有显式设置为 `0` 才使用 BrowserWindow 宿主调试路径。
- 真实服务器 visual smoke 现在强制要求 mpv 播放使用 `mode=wid`、`hostKind=native-child` 和 app-owned child `hwnd`；否则直接失败。
- 本地 embedded smoke 同步拒绝 overlay，不再把外部窗口截图当成可接受的嵌入证据。

## 验证
- `node --check electron\main.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`

## 下一步
- 继续修首页最大化空白、详情页大窗口布局和图片兜底。
- 之后必须用真实账号、真实服务器、多尺寸窗口复测；如果 native child 仍黑屏或泄漏，视为未通过并继续修，不再回退到 overlay 伪内嵌。
