# 收藏、历史与聚合视界加载修正

- **动机**：用户反馈收藏、聚合视界和历史均无法正确加载；现有历史只按 `IsPlayed` 查询，会漏掉未看完但已经有进度的条目，聚合视界也复用了同样的基础历史结果。
- **变更**：
  - 新增 `src/utils/personalMedia.ts`，集中封装收藏、播放历史合并、去重和历史排序逻辑。
  - 收藏页改为共享收藏查询，包含电影、剧集和单集，并保留错误态与重试入口。
  - 历史页改为合并 `IsPlayed` 与 `Items/Resume` 结果，未看完的电影/单集也会进入播放历史，分页继续按已播放查询推进并去重。
  - 聚合视界复用同一套收藏与个人历史加载逻辑，避免概览和历史页口径不一致。
- **验证**：
  - 通过：`npm.cmd run build`
  - 通过：`npm.cmd run electron:build`
  - 通过：`npm.cmd run check:electron-commands`（由 Electron 打包链路执行）
  - 通过：`npm.cmd run check:electron-package`（由 Electron 打包链路执行）
  - 通过：`git diff --check`
  - 未完成：in-app Browser 当前仍无可用 route，本轮未做浏览器目检。
- **结果**：通过；收藏、历史和聚合视界改为使用统一的真实个人媒体集合逻辑，历史不再只显示已看完项目。
