# 2026-06-02 21:06 Embedded warning cleanup

## 背景
- `mpv-embedded` feature check/build 已通过，但仍有 `EmbeddedHandle` trait 中 `set_rect` / `set_visible` 未使用的 warning。

## 本阶段变更
- 将 `EmbeddedHandle` trait 收缩为只保留 manager 实际需要的 `bind()`。
- `set_rect()` / `set_visible()` 继续作为 `MpvEmbeddedBackend` 的固有方法，由 manager 直接调用，不改变运行行为。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `cargo check --manifest-path src-tauri\Cargo.toml --offline`

## 结论
- `mpv-embedded` warning 已清理，本地 feature/非 feature Rust 门禁均通过。
- 真实 Tauri visual smoke 仍因 GUI/网络审批 429 未执行，不能声明播放器视检通过。
