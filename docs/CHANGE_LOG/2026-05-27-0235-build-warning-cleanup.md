# 构建与 Warning 清理

- **时间**：2026-05-27 02:35 (UTC+8)
- **动机**：验证前端生产构建与 Tauri/Rust 检查，清理构建输出中的 Rollup chunk 提示和 Rust unused warning，降低后续真实问题被噪音掩盖的风险。
- **修改文件**：
  - `src/stores/player.ts` — 将动态引入的 `useDownloadsStore` 调整为静态导入，消除 Rollup 动态/静态混用 chunk 提示。
  - `src-tauri/src/danmaku/mod.rs`、`src-tauri/src/emby/mod.rs`、`src-tauri/src/mpv/mod.rs`、`src-tauri/src/network/mod.rs` — 收窄模块 re-export，避免未使用公开导入 warning。
  - `src-tauri/src/mpv/ipc.rs`、`src-tauri/src/mpv/window_host.rs` — 移除不必要 `mut` / 调整条件编译导入，保持 Windows 构建可用。
  - `src-tauri/src/danmaku/dandanplay.rs`、`src-tauri/src/emby/endpoints.rs`、`src-tauri/src/mpv/backend.rs`、`src-tauri/src/network/http.rs`、`src-tauri/src/network/racer.rs` — 为当前阶段保留但尚未消费的 API/字段添加局部 `allow(dead_code)`。
  - `docs/CURRENT_STATE.md` — 回写当前验证状态与变更日志引用。
- **风险**：低。主要为导出面收窄、warning 标注与导入方式调整；未改变播放器命令语义、MPV IPC 协议或配置存储结构。
- **回滚**：还原上述代码文件与本 changelog / `CURRENT_STATE.md`。
- **验证步骤**：
  1. `cargo check --manifest-path emby-player/src-tauri/Cargo.toml --all-targets`
  2. `npm run build`
- **结果**：`npm run build` 与 `cargo check --all-targets` 均已通过；前端构建未再出现 Rollup 动态/静态混用 chunk 提示，Rust 检查无 warning 输出。
