# 2026-06-01 18:39 个人媒体页面真实服回归

## 结果

- 使用本机已保存的测试登录态做真实服务器只读 smoke，未输出服务器地址、token、账号密码或完整 URL。
- 服务端公开信息接口返回 200，当前保存线路可访问。
- 继续观看返回 3 条；历史 `IsPlayed=true` 与 `Filters=IsPlayed` 两种查询均返回 200 / 1 条。
- 收藏 `IsFavorite=true` 与 `Filters=IsFavorite` 两种查询均返回 200 / 0 条，判断为当前账号没有收藏，而不是接口失败。
- 本地预览 `http://127.0.0.1:1420/favorites`、`/history`、`/aggregate` 均返回 HTTP 200。
- Codex in-app Browser 通道本轮仍不可用，未完成截图目检。

## 验证

- 真实服务器只读个人媒体 smoke（仅输出状态码和数量）
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1420/favorites`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1420/history`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1420/aggregate`
