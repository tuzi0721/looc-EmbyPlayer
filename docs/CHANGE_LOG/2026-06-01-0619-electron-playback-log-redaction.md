# Electron 播放日志脱敏加固

- **时间**：2026-06-01 06:19 (UTC+8)
- **动机**：真实线路回归后继续检查敏感信息面，发现 Electron `playback.log` 的 URL 脱敏只处理 query token，header 数组中的 token 值存在按普通字符串写入日志的风险，远端主机名也仍会完整保留。
- **修改文件**：
  - `electron/main.mjs`：增强 `redactSensitive`，对播放日志中的远端 URL 主机名做脱敏预览，继续清理 query token，并识别 `Authorization` / token / api-key 类 header tuple。
  - `docs/CURRENT_STATE.md`：记录本轮日志脱敏加固。
- **风险**：日志里的远端 host 可读性降低，但保留协议、端口、路径和脱敏主机名，仍能判断请求形态；本地 `localhost` / IP 调试地址不脱敏。
- **回滚**：恢复 `redactUrl` / `redactSensitive` 的上一版实现，并删除本日志与状态段落。
- **验证步骤**：
  - `node --check electron\main.mjs`
  - `npm.cmd run check:electron-commands`
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描确认未写入测试账号、密码、token 或完整线路地址。
  - `npm.cmd run electron:build`
- **结果**：通过；Electron 播放日志写入前会进一步遮住远端线路主机名与 header token。
