# 2026-06-02 07:44 真实服务器脱敏复测

## 背景
- 用户要求不能只用假服务端 smoke，需要用测试账号连接真实服务器验证。
- 本轮视觉和播放修复后，再次执行真实服务器脱敏连通性检查。

## 验证方式
- 使用 `scripts\real-server-connectivity-check.mjs`。
- 输入通过临时 stdin 文件传递，执行后立即删除。
- 输出只保留 HTTP 状态、服务类型、是否有版本/服务名、媒体库视图数量，不记录 token、账号、密码、完整线路 URL 或播放 URL。

## 结果
- 沙箱普通网络下两条线路均为 `fetch failed`。
- 提权网络复测：
  - line1: `System/Info/Public` HTTP 200，`AuthenticateByName` HTTP 200，`Users/{id}/Views` HTTP 200；识别为 Emby，服务版本和服务名存在，媒体库视图数量 5。
  - line2: `System/Info/Public` HTTP 403，内容类型为 HTML；未进入登录和媒体库视图阶段。
