# 服务器识别登录 smoke 加固

## 背景

用户指出添加服务器必须支持任意端口、用户名/密码登录、自动识别 Emby/Jellyfin，且新增服务器应该追加而不是挤掉已有记录。本阶段把这些要求补进现有首页 smoke，避免后续只验证媒体库而绕过服务器识别链路。

## 变更

- `scripts/smoke-electron-home-hero.mjs`
  - 默认 CDP 调试端口改为随机端口，减少旧 Electron 测试进程污染。
  - 在登录前先写入一个已有服务器，再通过随机端口 fake Emby 执行 `detect_server`。
  - 断言服务端类型识别为 Emby、服务端名称来自 `System/Info/Public`、胜出线路为当前线路。
  - 断言 `add_server` 后服务器数量增加 1，证明新增服务器是追加而不是覆盖。
  - 断言保存的线路 URL 保留 fake Emby 的随机端口。
  - 随后继续完成用户名/密码登录、首页巨幕、收藏、历史和聚合视界检查。

## 验证

- 通过：`node --check scripts\smoke-electron-home-hero.mjs`
- 通过：`node scripts\smoke-electron-home-hero.mjs`
  - `detected.kind=emby`
  - `detected.serverName=Home Hero Smoke`
  - `detected.winningLineId=home-line`
  - `serverCounts.before=2`，`serverCounts.after=3`
  - 保存线路 URL 为随机端口 fake Emby 地址。

## 风险

- 该 smoke 使用本地 fake Emby，不记录真实账号、真实线路或真实播放 URL。
- 它验证客户端识别、追加、登录和媒体库链路；真实服务器仍可能受外部网络策略影响。

## 回滚

- 还原 `scripts/smoke-electron-home-hero.mjs` 并删除本日志即可。
