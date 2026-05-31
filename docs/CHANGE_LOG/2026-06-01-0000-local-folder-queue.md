# 本地文件夹播放队列

- **时间**：2026-06-01 00:00 (UTC+8)
- **动机**：上一阶段已经能从文件夹列出本地视频，但点击单个文件后播放器仍像孤立文件播放，上一集/下一集和选集菜单没有承接文件夹上下文。
- **修改文件**：
  - `src/stores/player.ts` — 播放队列增加 `remote` / `local` 类型，本地队列保留文件路径并在上一项、下一项切换时调用 `play_file`。
  - `src/views/LocalFolderView.vue` — 点击文件夹视频前写入本地队列，并把来源文件夹带到播放器 query。
  - `src/views/PlayerView.vue` — 选集菜单对本地队列显示文件名；本地队列切换时自动更新播放器 URL、重新尝试同名 XML 弹幕，并让返回按钮回到来源文件夹。
- **风险**：本地队列只来自当前文件夹列表，不持久化、不跨启动恢复；远端媒体队列仍沿用原有 item id 流程。
- **回滚**：移除 `queueKind` / `setLocalQueue` 等本地队列状态，恢复 `LocalFolderView` 点击时只跳转单个本地文件，移除 `PlayerView` 中本地队列标题、切换和返回逻辑即可。
- **验证步骤**：
  - `npm.cmd run build`（首次 Vite HTML 输出路径异常，重跑通过）
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/local-folder` 目检
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过。
