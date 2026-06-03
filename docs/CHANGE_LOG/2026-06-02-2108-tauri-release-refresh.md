# 2026-06-02 21:08 Tauri release refresh

## 背景
- 清理 `mpv-embedded` warning 后，需要刷新 release exe，确保产物包含最新默认后端、link-search 和 smoke 入口相关代码。

## 验证
- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline` 通过。
- 当前 Tauri release exe：
  - `src-tauri\target\release\emby-player.exe`
  - 时间：2026-06-02 21:04:26
  - 大小：8,055,808 bytes

## 结论
- Tauri/native `mpv-embedded` release exe 已刷新。
- 真实服务器 visual smoke 仍因 GUI/网络审批 429 未执行，播放器不能声明视检通过。
