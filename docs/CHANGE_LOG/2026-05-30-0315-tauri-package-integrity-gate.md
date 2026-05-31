# 2026-05-30 03:15 Tauri 打包完整性闸门

## 目标

让 Tauri release 产物也具备和 Electron unpacked 产物一样的随包 mpv 完整性检查，避免 release exe 旁缺失 mpv 时仍被误判为可发布。

## 变更

- 新增 `scripts/check-tauri-package.mjs`，检查 `src-tauri/target/release/emby-player.exe` 与 `target/release/resources/mpv`。
- 检查脚本会比对源 `src-tauri/resources/mpv` 与 release 产物 mpv 目录的文件数量和文件大小。
- 检查脚本会对 `mpv.exe`、`libmpv-2.dll`、`d3dcompiler_43.dll`、`mpv/fonts.conf` 设置最低体积保护。
- 新增 npm 脚本 `check:tauri-package`，并接到 `tauri:build` 后置步骤。

## 验证

已通过：

```powershell
node --check scripts\check-tauri-package.mjs
package.json JSON 解析检查
脚本接线检查
行尾空白检查
npm.cmd run check:tauri-package
npm.cmd run tauri:build
```

结果：`npm.cmd run tauri:build` 已完整执行前端构建、Tauri release 构建和后置 `check:tauri-package`；产物为 `src-tauri\target\release\emby-player.exe`，release `resources\mpv` 中 6 个随包 mpv 文件总量 213.7 MiB。

## 当前状态

- Electron 与 Tauri release 产物都有随包 mpv 完整性闸门。
- Tauri release 现在会在构建命令尾部自动验证 `emby-player.exe` 与 `resources/mpv`。
