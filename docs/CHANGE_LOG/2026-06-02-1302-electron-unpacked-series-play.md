# 2026-06-02 13:02 Electron unpacked 产物刷新

## 背景

上一阶段修复了 Series 详情页播放入口空点问题，需要刷新 Windows unpacked 产物，确保用户实际打开的 `Hills Lite.exe` 包含本次修复。

## 产物

- `release-electron\win-unpacked\Hills Lite.exe`
  - 文件时间：2026-06-02 13:02:31
- `release-electron\win-unpacked\resources\electron_mpv_host.exe`
  - 文件时间：2026-06-02 13:02:29

## 验证

- `npm.cmd run electron:build` 通过。
  - `check:electron-commands` 通过：104 renderer commands，105 Electron handlers，0 no-op。
  - `npm.cmd run build` 通过。
  - `cargo build --manifest-path src-tauri/Cargo.toml --release --bin electron_mpv_host` 通过。
  - `electron-builder --win dir` 完成。
  - `check:electron-package` 通过：随包 mpv、helper 和 `app.asar` 均存在。

## 备注

本阶段仅刷新 unpacked exe；portable 单文件包仍未生成。下一阶段继续用真实账号/真实服务器验证播放入口和可见播放器打开链路。
