# 2026-05-29 03:00 - Electron 弹幕源接入

## 本段目标
- 让 Electron 路径下的播放器弹幕按钮不再只得到空 provider 列表和空弹幕结果。
- 对齐 Tauri 侧已有的 DanDanPlay 匹配与评论拉取能力。

## 变更
- 新增 `electron/backend/danmaku.mjs`，提供弹幕 provider 注册表、DanDanPlay 文件名匹配、评论请求和评论解析。
- Electron 弹幕请求统一使用 `Hills Lite/0.1.0 (danmaku)` User-Agent，并声明 JSON Accept / Content-Type。
- DanDanPlay 评论解析支持滚动、顶部、底部和反向弹幕模式，并将十进制颜色转换为前端可用的十六进制颜色。
- Electron `list_danmaku_providers` 改为返回真实 provider 列表；`fetch_danmaku` 会读取当前账号、获取媒体详情、匹配 DanDanPlay 剧集并返回前端 `DanmakuResult`。

## 验证
- `node --check electron\backend\danmaku.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run build`
- `rg -n "[ \t]+$" electron\backend\danmaku.mjs electron\main.mjs docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-29-0300-electron-danmaku-provider.md`（无输出，退出码 1，表示未发现行尾空白）
- `npm.cmd run electron:build`
