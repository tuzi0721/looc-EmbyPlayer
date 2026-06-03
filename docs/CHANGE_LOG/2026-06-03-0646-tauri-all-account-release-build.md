# 2026-06-03 06:46 Tauri all-account release build

## 背景
- Tauri 后端已补 `list_items_all_accounts`、`search_all_accounts`、`resume_items_all_accounts` 与 `_source` 标注。

## 本阶段执行
- 重新构建 Tauri/native `mpv-embedded` release：
  - `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## 结果
- release 构建通过，耗时 4m 14s。
- `src-tauri\target\release` 根目录确认存在：
  - `emby-player.exe`：2026-06-03 06:46:04，8,116,736 bytes
  - `libmpv-2.dll`：99,202,048 bytes
  - `d3dcompiler_43.dll`：4,481,992 bytes

## 附加检查
- `git diff --check` 通过；输出仅包含当前工作区已有 LF/CRLF 提示。

## 下一步
- 立刻用该 release exe 继续真实 visual smoke，确认搜索阶段和后续真实播放阶段。
