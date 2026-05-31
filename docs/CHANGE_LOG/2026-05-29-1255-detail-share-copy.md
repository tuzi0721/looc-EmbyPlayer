# 2026-05-29 12:55 详情页分享复制

## 目标

详情页 Hero 的分享按钮从无响应占位变成可用动作，并复用统一剪贴板写入能力。

## 变更

- 新增 `src/utils/clipboard.ts`，封装 `writeTextToClipboard()`。
- 播放器截图路径复制和错误复制改为使用统一剪贴板工具。
- 详情页分享按钮接入 `shareItem()`。
- 有 Emby/Jellyfin Web 链接时复制服务器 Web 详情页链接。
- 无服务器 Web 链接时复制标题与 ItemId 作为兜底条目信息。
- 分享成功后在 Hero 内显示“分享链接已复制”或“条目信息已复制”，并在离开详情页时清理计时器。

## 验证

已通过：

```powershell
rg -n "writeTextToClipboard|shareStatus|sharePayload|shareItem|复制分享链接|分享链接已复制|条目信息已复制" src\utils\clipboard.ts src\views\PlayerView.vue src\views\DetailView.vue
rg -n "async function writeTextToClipboard" src
rg "[ \t]+$" src\utils\clipboard.ts src\views\PlayerView.vue src\views\DetailView.vue
npm.cmd run build
npm.cmd run electron:build
```

说明：剪贴板写入现在只有一个实现；`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过，新增 `clipboard` 小 chunk，PlayerView 仍低于 500 kB。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。未做真实详情页点击分享后的人工剪贴板验证。

## 当前状态

- 详情页分享按钮已可复制分享内容。
- 播放器与详情页共用剪贴板工具。
- 真实桌面剪贴板行为还需要后续人工确认。
