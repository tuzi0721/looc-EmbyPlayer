# 2026-06-01 19:47 设置页未接入入口清理

## 背景

设置页仍展示了部分“待接入”的能力入口，例如同步、AI 字幕、Plex、SMB、RTX VSR、TrueHDR、FSR、RIFE 与 GLSL Shaders。这些入口目前没有完整后端实现，容易让用户误以为功能已经可用。

## 变更

- 移除设置页“同步”和“AI 字幕”两个未接入面板，以及相关查询入口、summary 与能力列表。
- 移除画质增强面板里的 RTX VSR、RTX TrueHDR、AMD FSR、RIFE 与 GLSL Shaders 计划项，仅保留当前可触发的 Windows HDR 系统入口。
- 移除文件服务面板里的 SMB 与 Plex 计划项，仅保留当前真实可用的本地文件、本地文件夹、WebDAV 与 Alist / OpenList 路径。
- 设置页能力状态不再保留 `planned`，避免继续渲染“待接入”假入口。

## 验证

- `rg -n "planned|待接入|计划中|Whisper|Trakt|RTX|TrueHDR|FSR|RIFE|Plex|aiSubtitles|syncCapabilities|SMB" src/views/SettingsView.vue`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
