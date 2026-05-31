# 2026-05-30 04:05 Electron portable 完整性闸门

## 目标

把 Electron portable 单文件的存在性和体积检查固化进 `electron:dist`，避免只验证 unpacked 目录却漏掉最终发布 exe。

## 变更

- 新增 `scripts/check-electron-dist.mjs`，按 `build.productName` 与 `package.json` 版本定位 `release-electron\Hills Lite 0.1.0.exe`。
- 检查脚本会确认 portable 路径存在、确实是文件，并设置 50 MiB 最低体积保护。
- `electron:dist` 在 `check:electron-package` 后继续运行 `check:electron-dist`。

## 验证

已通过：

```powershell
node --check scripts\check-electron-dist.mjs
package.json JSON 解析检查
脚本接线检查
行尾空白检查
npm.cmd run check:electron-dist
npm.cmd run electron:dist
```

结果：`electron:dist` 已确认按“命令覆盖检查 → Vite build → portable builder → unpacked/mpv 完整性检查 → portable exe 完整性检查”顺序完成；`check:electron-dist` 输出 `release-electron\Hills Lite 0.1.0.exe (142.0 MiB)`。

## 当前状态

- Electron portable exe 已进入自动发布验证链。
- `electron:build` 检查 unpacked 与随包 mpv；`electron:dist` 额外检查最终 portable exe。
