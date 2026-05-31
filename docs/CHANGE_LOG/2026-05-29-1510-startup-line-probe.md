# 2026-05-29 15:10 启动期线路可达性探测

## 目标

应用启动完成后主动探测已保存服务器的线路可达性，让侧边栏和服务器选择页尽快显示最新健康状态，同时不阻塞首屏进入。

## 变更

- `server` store 新增 `probeAllLines()`，会并发调用每个服务器的 `test_lines`。
- 探测成功的服务器会合并到 `lastReports`，并在本轮探测后刷新一次服务器列表，使 `lastStatus` / `lastLatencyMs` 回写到 UI。
- `App.vue` 在初始设置、服务器、账号、下载和通知刷新完成后，以 fire-and-forget 方式启动后台线路探测。

## 验证

已通过：

```powershell
probeAllLines / Promise.allSettled / App.vue 启动接线落点检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。未在真实已配置服务器环境里等待网络探测结果做人工对比。

## 当前状态

- 启动期已有一次后台线路可达性探测。
- 首屏不等待网络探测，避免慢线路拖住启动。
- 手动“测试线路”仍保留原行为。
