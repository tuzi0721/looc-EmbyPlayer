# 2026-06-02 20:35 Electron embed VO matrix failed

## 背景
- 接上 20:22 的 reparent 诊断：mpv 内部能截图到真实帧，且 `WindowFromPoint` 已经命中被 reparent 到播放器区域内的 `mpv.exe` 窗口，但用户指出这仍不能等价于真实内嵌画面可见。
- 本阶段继续排除 Electron + mpv 窗口组合里的常见变量，仍只作为技术诊断，不作为真实服务器验收。

## 本阶段补充验证
- 默认 direct3d / reparent：mpv 内部截图有彩色帧，native 窗口截图仍黑。
- `--force-window=immediate`：启动时机提前后仍黑。
- `HILLS_ELECTRON_MPV_REPARENT_VO=gpu-next,gpu,direct3d`：切换 VO 候选后仍黑。
- `HILLS_ELECTRON_MPV_HWDEC=no`：关闭硬解后仍黑，说明不是单纯硬解表面无法组合。
- `HILLS_ELECTRON_DISABLE_GPU=1`：Electron 禁用 GPU 后可见区域变为白/灰低色彩块，但仍没有真实视频帧。
- 截图优先取 `attachedMpvWindowHandle`，且 `descendantCount=0`，说明这轮已经不是误截 helper 背景或漏掉更深层 child window。

## 结论
- Electron 里的 `--wid` child host 和 mpv top-level reparent 两条路都没有得到真实可见视频帧。
- 当前证据更指向 Windows/Electron compositor 与 mpv swapchain/child window 组合问题，而不是 Emby 登录、PlaybackInfo、服务器转码、mpv 解码、单一 VO 或截图取错层。
- 本阶段仍未通过播放器视检；下一步转向 Tauri/native 内嵌路径验证，优先确认 `mpv-embedded` + bundled libmpv 能否在原生窗口里产生真实可见帧。

## 验证门禁
- 继承上一阶段已通过的 `node --check`、`cargo check --bin electron_mpv_host` 和 `npm.cmd run build:electron-helper`。
- 本阶段额外运行的是多组本地 embedded smoke 诊断；本地彩条只用于排除技术变量，不作为用户验收依据。
