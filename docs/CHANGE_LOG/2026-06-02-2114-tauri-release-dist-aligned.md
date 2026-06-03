# 2026-06-02 21:14 Tauri release dist aligned

## 背景
- `npm.cmd run build` 刷新了 `dist`，需要重新构建 Tauri release exe，避免 exe 内嵌旧前端资源。

## 验证
- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline` 通过。
- 当前 Tauri release exe：
  - `src-tauri\target\release\emby-player.exe`
  - 时间：2026-06-02 21:10:22
  - 大小：8,055,808 bytes

## 结论
- 当前 Tauri release exe 已与最新 `dist` 对齐。
- 真实服务器 visual smoke 仍因 GUI/网络审批 429 未执行，不能声明播放器视检通过。
