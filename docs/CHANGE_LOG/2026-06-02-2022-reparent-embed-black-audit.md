# 2026-06-02 20:22 Reparent embed black-frame audit

## 背景
- 用户确认先前所谓“真实画面通过”的证据不可信：外部 mpv/overlay 画面不等于应用内嵌，页面海报或本地彩条也不能作为播放器通过证据。
- 本阶段只收敛 Electron + mpv 的真实窗口嵌入问题，不声明真实服务器播放通过。

## 已完成的诊断收敛
- `--wid` native child 路径已确认：helper 子窗口在 Hills Lite 内，mpv 内部 `screenshot-to-file` 能得到真实彩色帧，mpv 日志也显示首帧已输出，但系统/native capture 的播放器区域仍黑或白。
- 对 `--wid` host 做了子窗口枚举，`descendantCount=0`，说明不是“真正视频窗体藏在更深子窗口里没有截到”。
- 新增 reparent 实验路径：先启动 native child host，再把 mpv 自己创建的窗口按 PID 找到后 `SetParent` 到 host 内，并随 host 尺寸 resize。
- reparent 路径下 `WindowFromPoint` 已命中 `mpv.exe` 的窗口，说明 mpv 窗口确实进入了播放器区域；但 OS/native capture 仍是黑屏，mpv 内部截图仍是彩色帧。
- 清理链路仍正常：测试退出后没有遗留 mpv/helper 播放进程。

## 已通过的语法与构建门禁
- `node --check electron\main.mjs`
- `node --check electron\backend\mpv.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo check --manifest-path src-tauri\Cargo.toml --bin electron_mpv_host`
- `npm.cmd run build:electron-helper`

## 结论
- 本阶段仍未通过播放器视检，不能提交为完成态。
- 当前判断更接近 Windows composition / mpv VO swapchain / 子窗口嵌入的显示路径问题，而不是 Emby 登录、PlaybackInfo、本机解码或 mpv 解码失败。
- 下一步继续修可见内嵌输出；在真实内嵌画面可见之前，不再进入“真实服务器多尺寸通过”的结论。
