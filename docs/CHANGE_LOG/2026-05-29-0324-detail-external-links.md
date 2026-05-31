# 2026-05-29 03:24 - 详情页外部链接

## 本段目标
- 补齐 PDP 路线中的外部链接基础能力，让媒体详情页能跳转到服务端 Web 页面和常见媒体资料站。

## 变更
- `MediaItem` 类型新增 `ProviderIds`，Electron 媒体详情请求显式拉取并规范化 `ProviderIds`。
- 详情页 Hero 区新增外部链接 pills，支持当前 Emby/Jellyfin Web 页面、IMDb、TMDB、TVDB 和豆瓣。
- 外部链接复用现有 `api.openExternal`，点击后交给系统浏览器打开；失败时沿用详情页 action error 展示。

## 验证
- 通过 `node --check electron\backend\emby.mjs`。
- 通过 `npm.cmd run build`。
- 通过 `rg -n "[ \t]+$" electron\backend\emby.mjs src\types\models.ts src\views\DetailView.vue docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0324-detail-external-links.md`，未发现行尾空白。
- 通过 `npm.cmd run electron:build`，Electron unpacked 产物保持在 `release-electron\win-unpacked\Hills Lite.exe`。
