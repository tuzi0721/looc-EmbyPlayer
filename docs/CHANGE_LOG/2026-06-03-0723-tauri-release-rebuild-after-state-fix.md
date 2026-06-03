# 2026-06-03 07:23 Tauri release rebuild after state fix

## 背景
- 已修复 Tauri embedded mpv event-drain、播放器内嵌矩形和 Tauri `play` 返回结构。
- 需要刷新前端 `dist` 和 Tauri release exe，再进入真实账号视检。

## 验证
- `npm.cmd run build`
- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline`
- `git diff --check`

## 结果
- 前端生产构建通过，包含本机解码守卫、planned UI 守卫、`vue-tsc --noEmit` 和 Vite build。
- Tauri release 构建通过，最新 exe:
  - `src-tauri\target\release\emby-player.exe`
  - LastWriteTime: `2026/6/3 07:17:29`
  - Size: `8,127,488`
- `libmpv-2.dll` 和 `d3dcompiler_43.dll` 仍在 release exe 同级目录。
- `git diff --check` 仅输出 LF/CRLF warning，没有 whitespace error。

## 下一步
- 立即使用真实测试账号重跑 Tauri release visual smoke。
