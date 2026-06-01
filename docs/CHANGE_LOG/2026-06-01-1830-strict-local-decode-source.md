# 2026-06-01 18:30 严格本机解码媒体源判定

## 变更

- Electron / Web Preview / Tauri 的播放源选择逻辑从“未明确否定即可尝试”收紧为“必须明确 `Direct Play` 或 `Direct Stream` 为可用”。
- 播放器媒体源菜单同步收紧：未明确支持本机直连或本机直流的媒体源会禁用，点击切换时给出避免服务端解码/转码的错误提示。
- 详情页媒体信息文案同步调整，未确认本机解码能力的版本显示为不可播放，避免把含糊能力误读成可播放。
- `check:local-decode` 增加严格判定锚点，防止后续把宽松媒体源判断重新引入播放链路。

## 验证

- `node --check scripts\check-local-decode-guard.mjs`
- `node --check electron\backend\emby.mjs`
- `npm.cmd run check:local-decode`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
