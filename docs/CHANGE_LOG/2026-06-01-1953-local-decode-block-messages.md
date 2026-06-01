# 2026-06-01 19:53 本机解码拦截提示统一

## 背景

播放链路已经禁止服务端转码/解码，但部分后端拒绝提示仍是英文，用户看到时容易误判为普通播放失败。考虑到多数 Emby/Jellyfin 服务端只是 NAS、路由器或小规格 VPS，客户端必须明确告诉用户：这是为了保护服务端资源而主动拦截。

## 变更

- Electron 播放源选择在所选媒体源不支持本机直连 / 本机直流时，返回中文拦截提示。
- Web Preview 播放源选择使用同样的中文拦截提示，保持预览路径与桌面路径一致。
- Tauri 播放、外部播放、下载与远程播放入口的本机解码拒绝提示统一改为中文。
- 拒绝提示明确说明 Hills Lite 不允许服务端解码/转码，并提示用户换用可本机解码的版本或线路。

## 验证

- `node --check electron\backend\emby.mjs`
- `node --check scripts\check-local-decode-guard.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `rg -n "Server transcoding is disabled|server transcoding is disabled|Direct Play or Direct Stream media source" electron src src-tauri -g "!src-tauri/target/**" -g "!dist/**" -g "!release-electron/**" -g "!node_modules/**"`
- `npm.cmd run check:local-decode`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
