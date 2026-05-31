# 在线字幕搜索接入 ASSRT

## 背景

目标清单里“通过 assrt 在线搜索字幕”此前基本没有落地。该功能依赖外部服务 token，不能伪造固定结果，也不能把用户凭据写入仓库。

## 改动

- 新增 `search_online_subtitles` / `resolve_online_subtitle` 平台命令，Electron 与 Tauri 都走 ASSRT API。
- 搜索请求按 ASSRT 文档使用 `q`、`cnt`、`pos`，限制关键词至少 3 个字符、结果数量最多 15 条。
- 搜索结果宽松解析 `id`、标题、`lang.desc`、`subtype`、发布组、上传时间和评分。
- 详情解析会从 `filelist` / `files` 中优先挑选 `.srt` / `.ass` / `.ssa` / `.vtt`，解析出可交给 mpv `sub-add` 的字幕 URL。
- 播放器字幕面板新增“在线字幕”区，ASSRT Token 仅保存在运行时浏览器本地存储，不写入项目文件；搜索词会优先用当前影片/剧集名预填。
- Web Preview 不伪造外部请求：搜索返回空结果，解析字幕明确报不支持在线加载。

## 验证

- `node --check electron\main.mjs`
- `npm.cmd run check:electron-commands`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `git diff --check`
- `git grep` 敏感关键字扫描：仅命中字段名、脱敏逻辑、测试占位和历史说明，没有写入真实账号、密码、token 或完整播放 URL。

## 未覆盖

- 没有用户 ASSRT Token，因此未做真实 ASSRT 搜索/下载请求。
- in-app Browser 本轮拒绝打开 `127.0.0.1:1420`，未做在线字幕面板的浏览器视觉目检。

## 下一步

继续从目标清单里挑未完全落地的用户功能推进；下一段优先扫描“尚无实现或只是基础状态”的播放器/字幕/桌面体验项。
