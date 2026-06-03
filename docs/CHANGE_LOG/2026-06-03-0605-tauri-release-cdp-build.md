# 2026-06-03 06:05 Tauri release CDP build

## 背景
- `HILLS_TAURI_CDP_PORT` 注入逻辑已通过 `mpv-embedded` check，但真实 visual smoke 必须运行包含该逻辑的新 release exe。

## 本阶段执行
- 重新构建 Tauri/native `mpv-embedded` release：
  - `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## 结果
- release 构建通过，耗时 4m 48s。
- 新 exe：`src-tauri\target\release\emby-player.exe`
  - LastWriteTime：2026-06-03 06:04:23
  - Size：8,056,832 bytes

## 附加检查
- `git diff --check` 通过；输出仅包含当前工作区已有 LF/CRLF 提示。

## 下一步
- 立刻使用该 release exe 运行真实账号 Tauri visual smoke；若 CDP target 已可用，继续进入真实登录、真实媒体播放、多尺寸窗口、起播后 5 秒截图、seek/fullscreen/退出清理检查。
