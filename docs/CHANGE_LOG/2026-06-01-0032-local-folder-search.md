# 本地文件夹搜索筛选

- **时间**：2026-06-01 00:32 (UTC+8)
- **动机**：本地文件夹支持递归扫描后，列表可能明显变长；用户需要在当前扫描结果里快速按文件名或子目录路径定位视频，并让播放队列跟随筛选结果。
- **修改文件**：
  - `src/views/LocalFolderView.vue` — 新增搜索框，按文件名、相对路径和扩展名过滤当前列表；计数显示筛选数 / 总数；点击播放时本地队列使用筛选后的结果。
  - `src/views/SettingsView.vue` — 更新“文件夹媒体库”能力说明，不再停留在“这一层”目录的旧描述。
- **风险**：搜索只过滤当前已扫描的最多 500 条结果，不是磁盘级全文索引；如果扫描已截断，搜索范围也随之受限。
- **回滚**：移除 `searchText`、`visibleItems`、搜索工具栏和设置页文案更新即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://localhost:1420/local-folder?folder=...` 目检搜索框、计数区和窄宽布局；该 Browser 环境的文本输入被虚拟剪贴板限制，未将自动键入列为通过项
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 命令覆盖检查仍为 93/93，Electron unpacked 包完整性检查通过。
