# 详情页桌面下载入口

- **时间**：2026-06-01 06:27 (UTC+8)
- **动机**：下载中心已经具备真实任务管理，但详情页仍没有从媒体条目直接创建桌面下载任务的入口，用户需要先离开详情页或依赖后续页面操作，不符合常见离线保存流程。
- **修改文件**：
  - `src/views/DetailView.vue`：接入 `useDownloadsStore`，在 Electron/Tauri 桌面运行时为电影、单集以及剧集的继续观看单集显示 Hero 圆形下载按钮；点击后以 `preferDirect` 创建真实下载任务，并跳转到 `/downloads?task=...` 定位任务。
  - `docs/CURRENT_STATE.md`：记录详情页下载入口与本轮验证范围。
- **风险**：Web Preview 没有真实桌面下载后端，因此入口仅在 Electron/Tauri 运行时显示；剧集页当前下载目标为“继续观看”单集，不代表整季或整剧下载。
- **回滚**：移除 `DetailView.vue` 中的下载 store、下载按钮和 `startDownload` 方法，并删除本日志与状态段落。
- **验证步骤**：
  - `npm.cmd run build`
  - in-app Browser 1420 使用真实测试账号会话打开真实详情页，确认 Web Preview 运行时不显示桌面下载按钮，详情页无加载失败。
  - `npm.cmd run check:electron-commands`
  - `git diff --check`
  - 敏感关键字扫描确认未写入测试账号、密码、token 或完整线路地址。
  - `npm.cmd run electron:build`
- **结果**：通过；详情页已具备桌面下载入口，Web Preview 继续避免展示不可用的假下载按钮。
