# 2026-05-29 14:10 Web 预览隐藏 mpv 检测横幅

## 目标

普通 Web/Vite 预览环境不再显示无意义的“未检测到 mpv 播放器内核”横幅，避免遮挡 UI 视觉验证。

## 变更

- Web 预览平台回退中的 `detect_mpv` 改为返回 `found: true`。
- 返回路径标记为 `Web Preview`，只影响无 Electron bridge、无 Tauri runtime 的浏览器预览环境。
- Electron/Tauri 桌面运行时仍走真实 mpv 检测。

## 验证

已通过：

```powershell
rg -n "detect_mpv|Web Preview" src\platform\index.ts
rg -n "[ \t]+$" src\platform\index.ts
npm.cmd run build
npm.cmd run electron:build
```

浏览器验证已通过：

- 打开 `http://127.0.0.1:5173/`。
- 关闭首启引导。
- 首页空状态保留。
- 无“未检测到 mpv 播放器内核”和“下载 mpv”横幅内容。
- 无新增控制台 error。

说明：`npm.cmd run build` 与 `npm.cmd run electron:build` 均通过。Electron builder 仍有既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- Web 预览环境更适合作为页面烟测和截图验证入口。
- 桌面环境的 mpv 缺失提示不受影响。
