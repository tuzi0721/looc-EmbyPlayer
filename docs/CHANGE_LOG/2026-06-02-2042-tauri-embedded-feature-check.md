# 2026-06-02 20:42 Tauri embedded feature check

## 背景
- Electron `--wid` native child 与 mpv top-level reparent 均无法得到真实可见视频帧，下一步转向 Tauri/native `mpv-embedded` 路线。
- Tauri 代码中已经存在 `MpvEmbeddedBackend`、`HostWindow`、`embed_attach` / `embed_set_rect` / `embed_set_visible` 命令和前端 rect 上报逻辑，但 `mpv-embedded` 是可选 feature。

## 本阶段变更
- 将 `src-tauri/Cargo.toml` 中可选依赖 `libmpv2` 从 `version = "4"` 升到 `version = "5"`。
- 原因：当前本机 Cargo 缓存已有 `libmpv2 5.0.3` 和 `libmpv2-sys 4.0.1`，但缺少 `libmpv2 4.1.0`；沙箱内无法下载，普通网络拉取也曾长时间无编译进展。
- 使用 `cargo update --manifest-path src-tauri\Cargo.toml -p libmpv2 --precise 5.0.3 --offline` 更新锁文件。

## 验证
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline` 通过。
- 仅有一个 warning：`EmbeddedHandle` trait 中 `set_rect` / `set_visible` 方法未直接使用；不影响本阶段的 feature 编译结论，后续运行验证时再决定是否清理 trait。

## 结论
- Tauri/native `mpv-embedded` 路线已通过最小编译门槛，可以继续进入运行期验证。
- 本阶段仍不能声明播放器视检通过；下一步需要启动 Tauri/native 产物或 smoke，使用真实服务器起播后 5 秒、多个窗口尺寸检查真实可见视频帧。
