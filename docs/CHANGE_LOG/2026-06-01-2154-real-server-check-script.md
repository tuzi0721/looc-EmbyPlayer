# 真实服务器脱敏检查脚本

## 背景

用户要求用测试账号连接真实 Emby/Jellyfin 服务器验证。账号、密码、token、完整真实线路和播放 URL 不能写入日志或文档，因此本阶段新增一个只从 stdin 或环境变量读取输入、只输出脱敏结果的检查脚本。

## 变更

- `scripts/real-server-connectivity-check.mjs`
  - 从 stdin 或 `HILLS_REAL_*` 环境变量读取两条线路、用户名和密码。
  - 对每条线路执行 `System/Info/Public`、`Users/AuthenticateByName`、`Users/{id}/Views`。
  - 输出只包含线路标签、HTTP 状态、content-type、服务端类型、版本/服务端名是否存在、媒体库数量和错误摘要。
  - 不输出 token、账号、密码、完整线路 URL 或播放 URL。

## 验证

- 通过：`node --check scripts\real-server-connectivity-check.mjs`

## 未完成

- 本轮没有把真实账号密码写入命令行执行。系统拒绝了这种方式，因为命令行传参会把凭据暴露到本机 shell / 进程表面。
- 后续真实线路复核需要更安全的输入通道，或用户明确批准命令行传参风险后再执行。

## 风险

- 该脚本只做连通性、认证和媒体库视图检查，不发起播放，不请求服务端转码。

## 回滚

- 删除 `scripts/real-server-connectivity-check.mjs` 和本日志即可。
