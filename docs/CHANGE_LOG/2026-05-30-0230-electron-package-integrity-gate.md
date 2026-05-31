# 2026-05-30 02:30 Electron 打包完整性闸门

## 目标

把“Electron 发布产物必须自带完整 mpv”固化为自动检查，而不是依赖人工翻目录确认；mpv 更新只随新版本迭代进入随包资源。

## 变更

- 新增 `scripts/check-electron-package.mjs`，检查 Electron unpacked 产物、`app.asar` 与随包 mpv 目录。
- 检查脚本会确认 `package.json` 的 `extraResources` 仍把 `src-tauri/resources/mpv` 复制到 `resources/mpv`。
- 检查脚本会比对源 mpv 目录与打包后 mpv 目录的文件数量和文件大小，并对 `mpv.exe`、`libmpv-2.dll`、`d3dcompiler_43.dll`、`mpv/fonts.conf` 设置运行时最低体积保护。
- 新增 npm 脚本 `check:electron-package`，并接到 `electron:build` / `electron:dist` 的 builder 后置步骤。

## 验证

已通过：

```powershell
node --check scripts\check-electron-package.mjs
package.json / package-lock.json JSON 解析检查
rg -n "check:electron-package|check-electron-package" package.json scripts\check-electron-package.mjs
rg -n "[ \t]+$" package.json scripts\check-electron-package.mjs
npm.cmd run check:electron-package
npm.cmd run electron:build
```

结果：`electron:build` 已按“命令覆盖检查 → Vite 构建 → electron-builder → 打包完整性检查”顺序通过；打包完整性检查确认 6 个随包 mpv 文件已复制到 `release-electron\win-unpacked\resources\mpv`，总量 213.7 MiB，且 `app.asar` 存在。

## 当前状态

- Electron 目录打包产物现在会自动验证随包 mpv 完整性。
- `electron:dist` 已接入同一后置检查；本轮仍未实际生成 portable 包。
- 项目仍坚持内置 mpv 模型，不引入本机 mpv 检测或本机 mpv 提示。
