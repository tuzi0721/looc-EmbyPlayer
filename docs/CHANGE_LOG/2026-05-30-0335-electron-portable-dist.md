# 2026-05-30 03:35 Electron portable 发布包验证

## 目标

实际跑通 `electron:dist`，确认 Electron portable 单文件发布包可以生成，并且发布链路仍会经过命令覆盖检查和随包 mpv 完整性检查。

## 过程

- 第一次 `npm.cmd run electron:dist` 在 sandbox 内失败，因为 electron-builder 需要下载 NSIS 缓存。
- 授权联网后下载了 `nsis-3.0.4.1`；Windows 对缓存目录 rename 返回 Access denied，已将完整临时缓存目录复制到 electron-builder 期望目录。
- 第二个资源包 `nsis-resources-3.4.1` 也遇到相同缓存 rename 问题，按同样方式复制完整临时缓存目录。
- 缓存齐备后再次运行 `electron:dist`，portable 构建完成，并执行后置 `check:electron-package`。

## 验证

已通过：

```powershell
npm.cmd run electron:dist
portable 文件存在性检查
Electron unpacked 随包 mpv 检查
NSIS 缓存目录检查
```

结果：生成 `release-electron\Hills Lite 0.1.0.exe`，大小 148,865,089 bytes；`release-electron\win-unpacked\resources\mpv\mpv.exe` 存在，大小 120,320,512 bytes；`electron:dist` 输出确认执行了 `check:electron-commands`、Vite build、portable builder 和 `check:electron-package`。

## 当前状态

- Electron unpacked 与 portable 发布路径都已实际验证。
- `.electron-builder-cache\nsis` 现在已有 `nsis-3.0.4.1` 与 `nsis-resources-3.4.1` 缓存，后续 portable 构建不应再为这两个资源联网。
