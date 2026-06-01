# 2026-06-01 15:50 - 详情页本机解码能力文案

## 变更

- `src/views/DetailView.vue`：媒体信息的播放能力不再把服务端 `SupportsTranscoding` 展示成可用能力。
- `src/views/DetailView.vue`：支持 Direct Play / Direct Stream 的媒体源显示为“本机直连 / 本机直流”。
- `src/views/DetailView.vue`：只有服务端转码能力、缺少本机直连/直流能力的媒体源显示为“仅服务端转码（不可播放）”。
- `docs/CURRENT_STATE.md`：同步更正详情页媒体信息描述，避免继续把转码列为可用播放能力。

## 验证

- 通过：`npm.cmd run build`
- 通过：`git diff --check`，仅提示 Windows 工作区行尾转换。
- 通过：主动转码播放入口扫描未发现 `TranscodingUrl` / `master.m3u8` / `EnableTranscoding: true` 残留。
- 通过：详情页唯一中文“转码”文案是“仅服务端转码（不可播放）”。
- 通过：`npm.cmd run electron:build`

## 备注

- 播放链路继续保持 2026-06-01 14:33 阶段的硬约束：客户端只接受本机可解码的 Direct Play / Direct Stream 媒体源，服务端只给转码源时应失败而不是播放。
