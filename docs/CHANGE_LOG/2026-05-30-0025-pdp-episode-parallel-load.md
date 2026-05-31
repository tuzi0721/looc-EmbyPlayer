# 2026-05-30 00:25 PDP Episode 并行加载

## 目标

从单集详情页进入 PDP 时，季列表和当前季剧集不再串行等待，减少首屏剧集区可用前的空转时间，并避免快速切换详情项时旧请求覆盖新状态。

## 变更

- `DetailView.vue` 为详情加载和剧集加载分别增加序号防抖，旧请求返回后不再覆盖新页面的剧集、错误态和 loading 态。
- 单集详情页识别 `SeasonId` / `SeriesId` 后，使用 `Promise.all` 并行加载季列表与当前季剧集。
- 单集并行加载成功后会抑制一次由 `activeSeasonId` 触发的重复剧集请求，保留用户手动切季时的正常加载。

## 验证

已通过：

```powershell
DetailView Promise.all / episodeLoadSeq / suppressNextSeasonWatch / stale guard 落点检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。未在真实剧集详情数据下做人工视觉目检。

## 当前状态

- 单集 PDP 会并行补齐季列表和当前季剧集。
- 快速切换不同详情项时，旧请求不再写入新详情页的主要加载态。
- 手动切换季仍会按当前剧集所属系列重新加载该季剧集。
