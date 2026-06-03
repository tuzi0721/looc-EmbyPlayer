# 2026-06-02 20:50 Tauri embedded default

## 背景
- Tauri/native `mpv-embedded` 已经可以编译和链接，但后端默认值仍是 `ipc`。
- 如果 feature 已启用却默认继续走 IPC，就可能回到 `mpv.exe --wid` 路径，无法真正验证 libmpv embedded 路线。

## 本阶段变更
- `MpvBackendKind::default()` 改为条件默认：
  - 启用 `mpv-embedded` feature 时默认 `Embedded`。
  - 未启用 `mpv-embedded` feature 时仍默认 `Ipc`。
- Web Preview 与未启用 feature 的普通 Rust 构建不受影响。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `cargo check --manifest-path src-tauri\Cargo.toml --offline`

## 结论
- Tauri/native feature 产物的新默认播放后端已指向 `Embedded`。
- 本阶段仍未进入真实播放视检；下一步构建 release 产物，并进行运行期/真实服务器验证。
