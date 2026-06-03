# 2026-06-03 06:16 Tauri diagnostics release build

## 背景
- 已补 Tauri CDP timeout 早期诊断和独立 WebView2 data directory。
- 真实 visual smoke 必须运行包含这些改动的新 release exe。

## 本阶段执行
- 重新构建 Tauri/native `mpv-embedded` release：
  - `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## 结果
- release 构建通过，耗时 4m 10s。
- 新 exe：`src-tauri\target\release\emby-player.exe`
  - LastWriteTime：2026-06-03 06:16:16
  - Size：8,057,856 bytes

## 附加检查
- `git diff --check` 通过；输出仅包含当前工作区已有 LF/CRLF 提示。

## 下一步
- 立刻使用该 release exe 重跑真实账号 visual smoke，验证 CDP 是否进入；若仍 timeout，则使用新增 `cdp-targets-failed` 诊断继续定位。
