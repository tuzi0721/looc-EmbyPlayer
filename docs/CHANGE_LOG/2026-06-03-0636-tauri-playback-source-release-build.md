# 2026-06-03 06:36 Tauri playback source release build

## 背景
- Tauri 后端已新增并注册 `get_playback_source` command。
- 真实 visual smoke 必须运行包含该 command 的新 release exe。

## 本阶段执行
- 重新构建 Tauri/native `mpv-embedded` release：
  - `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## 结果
- release 构建通过，耗时 4m 19s。
- `src-tauri\target\release` 根目录确认存在：
  - `emby-player.exe`：2026-06-03 06:36:36，8,080,896 bytes
  - `libmpv-2.dll`：99,202,048 bytes
  - `d3dcompiler_43.dll`：4,481,992 bytes

## 附加检查
- `git diff --check` 通过；输出仅包含当前工作区已有 LF/CRLF 提示。

## 下一步
- 立刻用该 release exe 重跑真实 visual smoke，确认 Tauri setup 能获取真实 PlaybackInfo 并继续进入多尺寸和播放检查。
