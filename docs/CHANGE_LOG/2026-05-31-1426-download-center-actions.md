# 2026-05-31 14:26 - 下载中心操作补齐
## 本段目标
- 把下载中心从基础任务列表推进到更接近桌面下载管理器的可用状态，补齐失败重试、打开所在目录和删除文件等常见操作。

## 变更
- `src/views/DownloadsView.vue` 新增任务级操作忙碌状态与错误提示，避免重复点击时没有反馈。
- 失败和已取消任务显示“重试”入口，复用已有 `resume_download` 后端能力继续下载。
- 每个有本地路径的任务显示文件名，并新增“打开所在目录”操作，调用现有 `open_path` 打开下载文件所在文件夹。
- 删除入口拆成“移除记录”和“删除文件和记录”，让用户可以保留本地文件或一并清理磁盘文件。
- 下载任务操作改为横向换行工具按钮，窄屏下自动堆叠，减少多操作挤压标题和进度信息。

## 验证
- `npm.cmd run build` 通过。
- `npm.cmd run check:electron-commands` 通过，仍为 91 个 renderer 命令 / 91 个 Electron handler。
- `git diff --check` 通过；仅有 Windows LF/CRLF 提示，无行尾空白错误。
- `npm.cmd run electron:build` 通过；Electron unpacked 产物包含 6 个随包 mpv 文件、`electron_mpv_host.exe` 和 `app.asar`。
- 尝试用 in-app Browser 打开 `http://localhost:1420/downloads` 时被 Browser URL policy 拒绝；本阶段未做浏览器视觉目检。

## 后续
- 下载中心后续可继续补真实任务的端到端人工验证，以及下载完成通知里的“打开目录 / 本地播放”动作联动。
