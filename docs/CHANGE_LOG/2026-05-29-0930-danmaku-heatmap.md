# 2026-05-29 09:30 - 弹幕热度条
## 本段目标
- 在不增加后端依赖的前提下，利用已加载弹幕数据在播放器进度条上显示弹幕密度，帮助用户快速感知高互动片段。

## 变更
- 播放页新增 `danmakuHeatmap` 计算属性，会按当前媒体时长把弹幕分成 60 个时间段统计密度。
- 统计时会复用弹幕合并后的 `count`，因此重复弹幕合并后的热度仍会反映原始数量。
- 播放器进度条新增琥珀色热度柱，按时间段映射到进度条位置，并按相对密度调整高度和透明度。
- 热度条仅在已加载弹幕且媒体时长有效时显示，不影响拖动 input 的交互。

## 验证
- `npm.cmd run build` 通过；仍仅有既有 PlayerView chunk 体积警告。
- `rg "[ \t]+$" src\views\PlayerView.vue` 无输出。
- `npm.cmd run electron:build` 通过；仍仅有既有 PlayerView chunk 体积、electron-builder author/duplicate dependency、DEP0190 警告。
- 本轮未做真实弹幕媒体播放下的人工热度条目检；已完成类型、构建和 Electron 打包验证。
