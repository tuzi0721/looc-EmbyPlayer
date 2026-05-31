# 2026-05-30 02:15 Electron 命令检查打包闸门

## 目标

把 Electron 命令覆盖检查从“需要手动记得运行”的验证项前移到 Electron 预览与打包脚本本身，避免未迁移命令进入 packaged build。

## 变更

- `electron:preview` 现在会先运行 `check:electron-commands`，再执行前端构建和 Electron 预览启动。
- `electron:build` 现在会先运行 `check:electron-commands`，再执行 Vite 构建与 `electron-builder --win dir`。
- `electron:dist` 现在同样在 portable 发布前执行 `check:electron-commands`；本轮未实际生成 portable 包，仅静态确认脚本链已接线。

## 验证

已通过：

```powershell
package.json / package-lock.json JSON 解析检查
rg -n "check:electron-commands" package.json
rg -n "[ \t]+$" package.json scripts\check-electron-command-coverage.mjs electron\before-build.mjs
npm.cmd run check:electron-commands
npm.cmd run build
npm.cmd run electron:build
```

结果：`electron:build` 输出中已先执行 `check:electron-commands`，当前 85 个 renderer 命令全部被 81 个 Electron handler 与 4 个显式 embed no-op 覆盖；随后 Vite 构建与 Electron unpacked 打包通过，仍无 duplicate dependency references、Node DEP0190 或空依赖 traversal fallback。

## 当前状态

- Electron 预览、目录打包和 portable 发布脚本都已具备命令迁移闸门。
- 后续新增 renderer `invoke` 时，如果没有同步新增 Electron handler 或显式 no-op，Electron 打包链会在进入 builder 前失败。
