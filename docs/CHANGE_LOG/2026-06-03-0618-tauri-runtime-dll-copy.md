# 2026-06-03 06:18 Tauri runtime DLL copy

## 背景
- 真实 visual smoke 诊断显示 Tauri release exe 在应用代码执行前以 `3221225781` 退出，符合 Windows loader 找不到运行期 DLL 的特征。
- `mpv-embedded` 动态链接 `libmpv-2.dll`，但此前只把 mpv 文件复制到 `target\release\resources\mpv`。

## 本阶段修改
- `src-tauri/build.rs` 继续保留 `resources\mpv` 的完整复制。
- 同时把以下运行期 DLL 复制到 target profile 根目录，也就是 `emby-player.exe` 同级：
  - `libmpv-2.dll`
  - `d3dcompiler_43.dll`

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- build script 改动已通过格式与 embedded check。
- 下一步刷新 release exe，并确认 DLL 已出现在 `src-tauri\target\release` 根目录后再跑真实 visual smoke。
