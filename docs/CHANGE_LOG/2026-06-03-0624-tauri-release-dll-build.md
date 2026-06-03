# 2026-06-03 06:24 Tauri release DLL build

## 背景
- `build.rs` 已修改为把 mpv 运行期 DLL 复制到 release exe 同级目录。

## 本阶段执行
- 重新构建 Tauri/native `mpv-embedded` release：
  - `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`

## 结果
- release 构建通过，耗时 4m 11s。
- `src-tauri\target\release` 根目录已确认存在：
  - `emby-player.exe`：2026-06-03 06:24:14，8,057,856 bytes
  - `libmpv-2.dll`：99,202,048 bytes
  - `d3dcompiler_43.dll`：4,481,992 bytes

## 附加检查
- `git diff --check` 通过；输出仅包含当前工作区已有 LF/CRLF 提示。

## 下一步
- 立刻用该 release exe 重跑真实账号 visual smoke，确认 loader failure 是否消失，并继续进入 CDP/真实登录/真实播放阶段。
