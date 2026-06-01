# 2026-06-01 20:08 浏览器可视路由复核

## 背景

首页巨幕、全屏自适应和设置页布局都需要真实可视检查。本阶段尝试启动本地预览并接入 in-app Browser，确认当前是否能做浏览器截图目检。

## 验证

- `npm.cmd run dev`
- in-app Browser 连接尝试：当前会话返回没有可用浏览器路由。
- `Invoke-WebRequest -UseBasicParsing http://localhost:1420/`
- `Invoke-WebRequest -UseBasicParsing http://localhost:1420/settings?c=servers`

## 结果

- Vite dev server 成功启动在 `http://localhost:1420/`。
- `/` 与 `/settings?c=servers` 均返回 HTTP 200。
- in-app Browser 通道不可用，本轮未完成截图目检；该项不记为视觉通过。
- 验证结束后已停止本轮 dev server，避免后台端口残留。
