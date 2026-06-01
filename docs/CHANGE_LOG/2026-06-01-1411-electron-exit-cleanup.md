# Electron 退出清理与原生全屏

- **动机**：用户反馈关闭 / 退出应用后播放仍在继续，任务管理器中会残留 Hills Lite、mpv 或内嵌宿主进程；同时 Windows 菜单栏 `File / Edit` 无实际价值，全屏行为仍像浏览器伪全屏。
- **变更**：
  - Electron 主窗口关闭不再默认隐藏到托盘，而是进入统一运行时清理流程。
  - 统一清理 mpv、内嵌宿主、遮黑窗口、全局快捷键、桌面媒体状态和防休眠状态。
  - mpv 与 `electron_mpv_host.exe` 退出增加 Windows `taskkill /T /F` 兜底，避免子进程树残留。
  - Electron 窗口隐藏默认菜单栏，并移除默认应用菜单。
  - 播放器全屏按钮在 Electron / Tauri 桌面运行时优先调用原生窗口全屏；Web Preview 仍回落到浏览器 Fullscreen API。
  - `closeToTray` 默认值改为关闭，避免新状态默认把关闭按钮变成隐藏按钮。
- **验证**：
  - 通过：`node --check electron\main.mjs`
  - 通过：`node --check electron\backend\mpv.mjs`
  - 通过：`node --check electron\backend\desktop.mjs`
  - 通过：`npm.cmd run check:electron-commands`
  - 通过：`npm.cmd run build`
  - 通过：`npm.cmd run electron:build`
  - 通过：`git diff --check`
  - 构建前已清除当时残留的 Hills Lite / mpv 宿主相关进程；构建结束后再次检查，未发现 `Hills Lite`、`emby-player`、`mpv` 或 `electron_mpv_host` 残留。
- **结果**：通过；本阶段优先闭环退出后继续播放和进程残留问题，后续继续清理主界面冗余入口与无关页面代码。
