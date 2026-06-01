# 真实服务器脱敏复核

## 背景

用户要求使用测试账号连接真实 Emby/Jellyfin 服务器，验证服务端识别、登录和媒体库读取。账号、密码、token、完整线路 URL 和播放 URL 不能写入日志或提交。

## 变更

- 无代码变更。
- 使用临时 stdin 输入文件执行 `scripts\real-server-connectivity-check.mjs`。
- 命令行没有携带账号、密码或完整线路 URL。
- 检查结束后已删除临时输入文件。

## 验证

- 线路 1：
  - `System/Info/Public`：HTTP 200，JSON。
  - `Users/AuthenticateByName`：HTTP 200，JSON。
  - `Users/{id}/Views`：HTTP 200，JSON。
  - 自动识别类型：Emby。
  - 服务端版本字段存在，服务端名称字段存在。
  - 媒体库视图数量：5。
- 线路 2：
  - `System/Info/Public`：HTTP 403，HTML。
  - 未进入登录和媒体库视图检查。

## 结论

- 当前测试账号可以通过线路 1 成功登录真实 Emby 服务端，并读取媒体库视图。
- 线路 2 当前被公开信息接口拦在 403，客户端不应把它标记为可登录线路。

## 风险

- 本阶段只验证公开信息、认证和媒体库视图读取，没有发起真实播放，也没有请求播放 URL。
- 如果线路 2 需要额外的反代规则、UA、白名单或端口路径配置，需要在设置页线路高级配置里补齐后再复测。

## 回滚

- 本阶段无代码变更；删除本日志并把 `docs/CURRENT_STATE.md` 最新日志指回上一条即可。
