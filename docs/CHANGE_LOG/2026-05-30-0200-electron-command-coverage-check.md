# 2026-05-30 02:00 Electron 命令覆盖检查

## 目标

把 renderer 调用的 `invoke("...")` 与 Electron main 已迁移命令之间的覆盖关系固化为可重复检查，防止后续新增前端调用后落入 `Electron backend command not migrated yet` 兜底错误。

## 变更

- 新增 `scripts/check-electron-command-coverage.mjs`，扫描 `src` 下的 `invoke("...")` 字符串命令。
- 脚本会解析 `electron/main.mjs` 中的 `command === "..."` handler 与 `noOpCommands` 显式 no-op 集合。
- 新增 npm 脚本 `check:electron-commands`，当 renderer 命令未被 Electron handler 或显式 no-op 覆盖时返回失败。

## 验证

已通过：

```powershell
node --check scripts\check-electron-command-coverage.mjs
npm.cmd run check:electron-commands
package.json JSON 解析检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

结果：当前 85 个 renderer 命令全部覆盖；Electron main 中 81 个真实 handler 与 4 个显式 embed no-op 命令被识别。`npm.cmd run electron:build` 仍保持干净输出。

## 当前状态

- Electron 命令迁移覆盖有了自动化保护。
- 后续新增 renderer `invoke` 时，应同步新增 Electron handler、加入明确 no-op，或让该脚本在验证阶段失败。
