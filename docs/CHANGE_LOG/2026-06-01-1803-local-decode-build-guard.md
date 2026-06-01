# 2026-06-01 18:03 本机解码构建门禁

## 目标
- 把“解码必须由本机承担，不能让 Emby/Jellyfin 服务端转码”的产品要求做成自动化门禁，避免后续开发把 `TranscodingUrl`、HLS 转码入口或 `EnableTranscoding: true` 重新带回播放链路。

## 改动
- `src-tauri/src/emby/models.rs`
  - `PlaybackInfoRequest` 增加 `DeviceProfile`。
  - 新增 Direct Play only 设备 profile：包含视频 / 音频直放容器、外置字幕 profile，并保持 `TranscodingProfiles` 为空数组。
- `src-tauri/src/emby/client.rs`
  - Tauri `PlaybackInfo` 请求同步携带 `Hills Lite Tauri Local Decode` 直放设备 profile。
- `scripts/check-local-decode-guard.mjs`
  - 新增源码扫描门禁，禁止播放代码出现 `TranscodingUrl`、`master.m3u8`、启用转码的 `EnableTranscoding` / `enable_transcoding`、`PlayMethod=Transcode` 和非空 `TranscodingProfiles`。
  - 同时检查 Electron、Web Preview、Tauri 播放 / 下载 / 远程会话路径都保留本机解码锚点。
- `package.json`
  - 新增 `check:local-decode`，并接入 `npm run build`，让前端构建、Tauri 构建前置构建和 Electron 打包都会触发该门禁。

## 验证
- 通过：`node --check scripts\check-local-decode-guard.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- 通过：`npm.cmd run build`
- 通过：`npm.cmd run electron:build`

## 回滚
- 移除 `check:local-decode` 脚本与 `package.json` 构建接线，并回退 Tauri `PlaybackInfoRequest.DeviceProfile` 即可；不建议回滚，除非同时有新的等价禁转码门禁替代。
