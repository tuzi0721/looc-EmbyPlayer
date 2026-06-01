# 2026-06-02 05:43 - Electron unpacked 产物刷新

## 变更

- 重新执行 `npm.cmd run electron:build`，把内嵌播放器控制层坐标修复打进 Windows unpacked 产物。
- 刷新 `release-electron\win-unpacked\Hills Lite.exe` 与随包 `resources\electron_mpv_host.exe`。
- `docs\CURRENT_STATE.md` 同步最新 unpacked exe 和 helper 时间戳。

## 验证

- `npm.cmd run electron:build`
- `check:electron-commands`
- `check:local-decode`
- `check:no-planned-ui`
- `vue-tsc --noEmit`
- `vite build`
- `cargo build --manifest-path src-tauri/Cargo.toml --release --bin electron_mpv_host`
- `check:electron-package`

## 结果

- `release-electron\win-unpacked\Hills Lite.exe` 文件时间：2026-06-02 05:43:22。
- `release-electron\win-unpacked\resources\electron_mpv_host.exe` 文件时间：2026-06-02 05:43:19。
- Electron package integrity 通过：随包 mpv、helper 和 `app.asar` 均存在。
