# 工作区与假入口复扫

## 背景

用户要求清理项目里的无关代码、无关文件和无法使用的入口。本阶段在真实服务器复核后再次扫描当前工作区和用户可见入口，确认没有新堆积和假功能回归。

## 变更

- 无代码变更。
- 无文件删除。
- 记录当前扫描结果，避免把历史归档文档里的旧描述误判为当前产品状态。

## 验证

- 通过：`git status --short --ignored`
  - 仅看到 6 个允许忽略目录：`.electron-user-data/`、`.vscode/`、`dist/`、`node_modules/`、`release-electron/`、`src-tauri/target/`。
- 通过：`npm.cmd run check:workspace`
  - 无意外未跟踪文件。
- 通过：`npm.cmd run check:no-planned-ui`
  - 76 个源码文件扫描通过，未发现计划/占位 UI 文案。
- 通过：`npm.cmd run check:electron-commands`
  - 101 个 renderer commands 与 101 个 Electron handlers 对齐，显式 no-op 命令为 0。
- 复扫关键字：
  - `smoke-test.ps1`、PATH/vendor mpv、关闭到托盘旧字段、占位/计划 UI 文案、转码 URL 等当前源码无用户可触发入口。
  - 命中项仅保留在当前状态/规范文档的“已删除/禁止恢复”说明，以及门禁脚本自身的规则文本中。

## 风险

- 历史 `docs/CHANGE_LOG/` 和归档计划文档仍会包含过去阶段的旧问题描述；当前判断应以 `docs/CURRENT_STATE.md`、最新日志和最新提交为准。
- `.electron-user-data/` 保留不删，用于保存本机测试登录态和运行状态。

## 回滚

- 删除本日志并把 `docs/CURRENT_STATE.md` 最新日志指回上一条即可。
