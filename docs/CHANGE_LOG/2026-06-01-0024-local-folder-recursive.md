# 本地文件夹递归扫描

- **时间**：2026-06-01 00:24 (UTC+8)
- **动机**：本地文件夹媒体库只能扫描第一层目录，遇到按剧集/季度/合集分层整理的视频目录时不够可用；需要在不假装做完整媒体库刮削的前提下，先把真实递归索引和播放队列打通。
- **修改文件**：
  - `electron/main.mjs` — `list_local_folder` 支持 `recursive`，递归扫描子目录，返回相对路径，并在超过 500 个视频时截断。
  - `src-tauri/src/commands/player.rs` — Tauri 同步实现递归扫描、相对路径、500 项上限和截断标记。
  - `src/api/index.ts` / `src/platform/index.ts` — 更新本地文件夹列表类型与 Web Preview 空权限 fallback。
  - `src/views/LocalFolderView.vue` — 增加“包含子文件夹”开关，显示相对路径、递归状态和截断提示，队列继续使用当前扫描结果。
- **风险**：递归扫描仍是轻量目录枚举，不做封面、元数据刮削或长期索引；遇到权限受限目录会按现有后端错误路径反馈给页面。为避免超大目录拖慢 UI，当前最多返回 500 个视频。
- **回滚**：移除 `recursive` / `relativePath` / `truncated` 字段和页面开关，将 `list_local_folder` 恢复为第一层目录扫描即可。
- **验证步骤**：
  - `cargo fmt --manifest-path src-tauri\Cargo.toml`
  - `node --check electron\main.mjs`
  - `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/local-folder` 与 `?folder=...` 状态目检，并确认“包含子文件夹”可切换
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查为 93/93，Electron unpacked 包完整性检查确认随包 mpv 与 `electron_mpv_host.exe` 均存在。
