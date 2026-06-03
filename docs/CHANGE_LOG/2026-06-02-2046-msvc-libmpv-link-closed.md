# 2026-06-02 20:46 MSVC libmpv link closed

## 背景
- `cargo check --features mpv-embedded` 只能证明 Rust 代码可类型检查，不能证明 MSVC 最终能链接 libmpv。
- 当前 Windows Rust toolchain 是 `x86_64-pc-windows-msvc`，而随包 mpv 目录原本只有 `libmpv.dll.a`，没有 MSVC 需要的 `mpv.lib`。

## 本阶段变更
- 使用 VS `dumpbin.exe /exports` 从 `src-tauri/resources/mpv/libmpv-2.dll` 读取导出表。
- 只保留 `mpv_` 开头的 libmpv API 导出，生成 MSVC import library：`src-tauri/resources/mpv/mpv.lib`。
- 在 `src-tauri/build.rs` 中加入 `cargo:rustc-link-search=native=.../resources/mpv`，并把缺失 `mpv.lib` 变成明确构建错误。

## 验证
- 首次实际 build 失败于 `LINK : fatal error LNK1181: 无法打开输入文件“mpv.lib”`。
- 生成 `mpv.lib` 并更新 `build.rs` 后，`cargo build --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline` 通过。
- 仍有一个既有 warning：`EmbeddedHandle` trait 中 `set_rect` / `set_visible` 未直接使用，后续可清理，但不影响链接闭环。

## 注意
- `lib.exe` 同时产出了 `mpv.exp` 临时文件；删除动作被安全/额度审查拒绝，本阶段未继续绕路删除。后续获得明确允许后再清理。

## 结论
- Tauri/native `mpv-embedded` 路线已从类型检查推进到实际 MSVC 链接通过。
- 本阶段仍不能声明播放器视检通过；下一步需要 release/运行期启动，并用真实账号做多窗口、起播后 5 秒可见帧验证。
