# 2026-05-29 12:40 移除详情页静态媒体选择器

## 目标

详情页不再展示写死的版本、音频和字幕下拉，避免用户误以为这些选择会影响实际播放。

## 变更

- 移除 `versionLabel`、`audioLabel`、`subLabel` 三个静态状态。
- 移除详情页 Hero 中的“版本 / 音频 / 字幕”静态下拉区域。
- 移除仅服务该区域的 `hero__pickers` 与 `picker` 样式。
- Hero 主体布局从 `1fr + auto` 改回单列，减少空列布局。

## 验证

已通过：

```powershell
rg -n "versionLabel|audioLabel|subLabel|hero__pickers|\.picker|WEB-DL|Japanese|Chinese Simplified" src\views\DetailView.vue
rg "[ \t]+$" src\views\DetailView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：静态选择器状态、模板和样式均无残留；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过，详情页构建产物体积随之下降。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 详情页 Hero 不再显示假的媒体版本/音频/字幕选择器。
- 真实版本、音轨、字幕选择仍以播放器内 mpv 轨道和字幕面板为准。
- 如果后续要在详情页预选媒体源，需要接入真实 PlaybackInfo 数据后再设计。
