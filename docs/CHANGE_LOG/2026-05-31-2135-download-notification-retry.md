# 下载失败通知重试动作

- **时间**：2026-05-31 21:35 (UTC+8)
- **动机**：下载失败通知已经进入通知中心，但用户从通知里只能定位任务，不能直接恢复失败任务；补齐通知动作后，失败下载能从 Toast 或通知中心一键重试。
- **修改文件**：
  - `electron/backend/downloads.mjs` — Electron 下载失败通知增加“重试”动作，并携带 `taskId`。
  - `src-tauri/src/download/engine.rs` — Tauri 下载失败通知同步增加“重试”动作。
  - `src/utils/notificationActions.ts` — 通知动作路由新增 `retry` 分支，调用下载 store 恢复任务后跳转到对应下载任务。
- **风险**：重试依赖原任务仍存在且后端可继续写入；如果源文件鉴权、网络或本地文件状态仍异常，任务会按现有下载逻辑再次失败并更新错误状态。
- **回滚**：撤回下载失败通知中的 `retry` action，并移除 `notificationActions.ts` 的 `retry` 分支即可恢复为仅定位任务。
- **验证步骤**：
  - `node --check electron\backend\downloads.mjs`
  - `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
  - `npm.cmd run check:electron-commands`
  - `git diff --check`
  - `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
  - `npm.cmd run build`
  - `npm.cmd run electron:build`
- **结果**：通过；Electron unpacked 包完整性检查通过。当前未人工构造真实失败下载任务点击通知，因此真实失败重试点击仍建议后续在有失败任务样本时补一轮手测。
