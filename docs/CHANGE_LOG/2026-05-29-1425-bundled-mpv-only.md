# 2026-05-29 14:25 内置 mpv 播放核心固定化

## 目标

Hills Lite 自带完整 mpv 播放核心，不再要求用户检测、下载或选择本机 mpv；mpv 更新随应用版本发布一起迭代。

## 变更

- 移除全局 `MpvBanner`，不再显示“未检测到 mpv 播放器内核”“下载 mpv”“选择 mpv 路径”等提示。
- 设置页播放器面板移除“MPV 路径”输入项，用户不再配置本机 mpv 可执行文件。
- 前端设置类型、默认设置、Web 预览默认设置、Electron 默认设置、Tauri 设置模型和 Tauri 设置补丁均移除 `mpvExecutablePath` / `mpv_executable_path`。
- 移除前端 `detectMpv` API、Web 回退 `detect_mpv`、Electron `detect_mpv` IPC 和 Tauri `detect_mpv` 命令。
- Electron mpv 解析只查找随包资源路径：`resources/mpv/mpv.exe`、`mpv/mpv.exe` 以及开发/构建资源目录；不再读取用户配置，也不再查找 PATH 中的 mpv。
- Tauri mpv 解析只查找可执行文件旁的 `resources/mpv/mpv.exe` / `mpv/mpv.exe`；不再读取用户配置，也不再通过 `which` 查找本机 mpv。
- `src-tauri` 移除不再需要的 `which` 依赖。

## 验证

已通过：

```powershell
node --check electron\main.mjs
node --check electron\backend\mpv.mjs
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
rg -n "mpvExecutablePath|mpv_executable_path|detect_mpv|detectMpv|MpvBanner|未检测到 mpv|下载 mpv|选择 mpv 路径|MPV 路径|where\.exe|spawnSync|which =|which::" src electron src-tauri package.json
npm.cmd run build
npm.cmd run electron:build
Test-Path release-electron\win-unpacked\resources\mpv\mpv.exe
Get-Item release-electron\win-unpacked\resources\mpv\mpv.exe
Get-ChildItem -File release-electron\win-unpacked\resources\mpv
```

浏览器验证已通过：

- 打开 `http://127.0.0.1:5173/`。
- 关闭首启引导。
- 进入“设置”并展开“播放器”面板。
- 确认没有“未检测到 mpv 播放器内核”“下载 mpv”“选择 mpv 路径”“MPV 路径”“留空使用内置 mpv”。
- 确认播放器面板仍保留 `MPV 后端`、硬件解码、缓存、网速、遮黑副屏、切轨缓存、跳片头片尾、截图字幕、授权查询参数和 Windows HDR 等真实设置。
- 确认无新增控制台 error。

说明：Electron 打包产物中已确认 `release-electron\win-unpacked\resources\mpv\mpv.exe` 存在，大小约 120 MB，且同目录包含 `libmpv-2.dll`、`d3dcompiler_43.dll`、`mpv.com` 等随包文件。`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- mpv 是应用随包播放核心，不再是用户本机环境依赖。
- 运行时不会再向用户展示本机 mpv 检测、下载或路径选择入口。
- mpv 更新策略为随 Hills Lite 新版本一起发布。
