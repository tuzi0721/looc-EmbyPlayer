# 2026-06-02 20:52 Tauri release embedded build

## 背景
- Tauri/native `mpv-embedded` 已通过 debug build 和默认后端调整，但真实验证需要 release 级别可运行产物。

## 验证
- `dist/index.html` 存在，release 构建不会回退到 `localhost:1420`。
- `cargo build --manifest-path src-tauri\Cargo.toml --release --features mpv-embedded --offline` 通过。
- 新产物：`src-tauri\target\release\emby-player.exe`
  - 时间：2026-06-02 20:51:21
  - 大小：8,055,808 bytes
- release 资源目录含：
  - `resources\mpv\libmpv-2.dll`
  - `resources\mpv\mpv.exe`
  - `resources\mpv\mpv.lib`

## 注意
- 源资源目录仍存在 `src-tauri/resources/mpv/mpv.exp`，这是生成 `mpv.lib` 时的临时文件；删除动作此前被安全/额度审查拒绝，本阶段未绕路删除。
- 本阶段只证明 release 产物可构建，仍不能声明真实播放视检通过。

## 下一步
- 启动 Tauri release 产物，尽量通过 WebView2 remote debugging 或现有 smoke 能力接入真实账号。
- 必须用真实服务器、真实媒体、起播后额外等待 5 秒、多个窗口尺寸检查真实可见视频帧。
