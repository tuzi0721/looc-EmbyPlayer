# 2026-05-30 05:00 内置 mpv resolver 与 QA 脚本收紧

## 目标

彻底消除运行时代码和 QA 脚本中对旧 vendor mpv 或系统 PATH mpv 的暗示，保持“应用自带完整 mpv，随版本更新”这一唯一模型。

## 变更

- Electron `resolveMpv()` 移除 exe 旁 `mpv\mpv.exe` 与 `src-tauri\vendor\mpv\mpv.exe` 旧候选路径。
- Electron mpv resolver 命中的候选统一视为应用管理的随包/源码内置路径，缺失时错误改为 `bundled mpv executable not found`。
- `scripts/test-playback-flow.ps1` 构建命令改为 `npm.cmd run ...`。
- `scripts/test-playback-flow.ps1` 不再提示系统 PATH mpv；release `resources\mpv\mpv.exe` 缺失时直接失败。

## 验证

已通过：

```powershell
node --check electron\backend\mpv.mjs
rg -n "vendor[\\/]mpv|requires system mpv|system mpv|where\.exe|which\(|spawnSync\(|detect_mpv|detectMpv|MpvBanner|下载 mpv|本机 mpv|local mpv" electron src src-tauri scripts package.json --glob "!src-tauri/target/**" --glob "!src-tauri/vendor/**" --glob "!release-electron/**" --glob "!node_modules/**"
rg -n "bundled mpv executable not found|bundled: true|npm\.cmd run tauri:build|npm\.cmd run build|Assert-PathExists \$mpv" electron\backend\mpv.mjs scripts\test-playback-flow.ps1
rg -n "[ \t]+$" electron\backend\mpv.mjs scripts\test-playback-flow.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-playback-flow.ps1 -SkipBuild
npm.cmd run check:electron-package
npm.cmd run electron:build
```

结果：QA 脚本无构建模式确认 `dist\index.html`、Tauri release exe 与 Tauri release 随包 mpv 均存在；Electron unpacked 打包链仍确认 6 个随包 mpv 文件已复制到 `release-electron\win-unpacked\resources\mpv`。

## 当前状态

- Electron 不再扫描旧 `vendor/mpv` 或 exe 旁临时 mpv 文件夹。
- QA 脚本不再允许用系统 mpv 代替随包 mpv。
