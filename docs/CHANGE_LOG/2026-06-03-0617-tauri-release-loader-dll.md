# 2026-06-03 06:17 Tauri release loader DLL failure

## 背景
- 已刷新带早期诊断的新 Tauri/native release exe，并重跑真实 visual smoke。

## 本阶段执行
- 模式：`HILLS_REAL_APP_MODE=tauri-release`。
- 启动目标：`src-tauri\target\release\emby-player.exe`。
- 本轮脚本已启用独立 WebView2 data directory 与 CDP timeout 诊断。

## 结果
- 仍未进入 WebView2 CDP。
- 新诊断显示子进程在早期直接退出：
  - `exitCode: 3221225781`
  - remote debugging 端口无监听
  - stdout/stderr 为空
  - `visual-smoke.log` 与 `crash.log` 均为空
- 这说明进程在应用代码执行前已被 Windows loader 终止，符合运行期 DLL 缺失特征。

## 结论
- 当前 `mpv-embedded` release exe 动态链接 `libmpv-2.dll`，但 build 脚本只把 mpv 文件复制到 `target\release\resources\mpv`，Windows loader 不会在启动前搜索该子目录。
- 下一步修 `src-tauri/build.rs`，把必要 mpv 运行期 DLL 同步复制到 release exe 同级目录，再重建并重跑真实 visual smoke。
