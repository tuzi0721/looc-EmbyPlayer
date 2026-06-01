# 2026-06-01 16:19 播放器媒体源本机解码保护

## 动机
- 用户明确补充：Emby/Jellyfin 私人服务端常见是 NAS、路由器或小规格 VPS，客户端必须本机解码，不能让服务端转码兜底，否则会造成极高 CPU 占用并被服主封禁。

## 变更
- `src/views/PlayerView.vue`：播放器“播放源 / 媒体源”菜单把候选源标记为“本机直连 / 本机直流 / 本机解码待确认”。
- 当媒体源只上报服务端转码能力、没有 Direct Play / Direct Stream 能力时，菜单项直接禁用，并在切换防线里再次阻止。
- 底层播放链继续沿用已落地的 Direct Play / Direct Stream only：禁用 PlaybackInfo 转码、静态流 URL `Static=true`、进度上报 `DirectStream`，不提供服务端转码 fallback。

## 风险
- 某些服务端如果没有正确上报 Direct Play / Direct Stream 标志，会显示“本机解码待确认”；实际播放仍由后端的静态流与禁转码请求兜底，失败时应让用户换源或修服务端配置，而不是转码播放。

## 验证
- 通过：`npm.cmd run build`。
- 通过：`git diff --check`。
- 通过：主动转码入口扫描未发现新的播放代码命中；仅命中文档中既有历史说明。
- 通过：`npm.cmd run electron:build`，包含 Electron command coverage、Vite build、`electron_mpv_host` release 编译、Electron unpacked 打包与随包 mpv/package 完整性检查。

## 回滚
- 移除 `PlayerView.vue` 的 `canUsePlaybackMediaSource()` / `mediaSourceCapabilityLabel()` 以及媒体源菜单禁用逻辑即可。
