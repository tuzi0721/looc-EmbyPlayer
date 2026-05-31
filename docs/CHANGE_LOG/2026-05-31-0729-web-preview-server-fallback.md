# 2026-05-31 07:29 Web Preview 服务器内存 fallback

## 目标

让 Web Preview 也能保存和编辑服务器配置，便于在浏览器里真实验证服务器设置 UI；该 fallback 只在没有 Electron / Tauri runtime 时生效，不影响桌面端真实存储。

## 改动

- `src/platform/index.ts` 新增 Web Preview 内存服务器列表。
- Web Preview 支持：
  - `list_servers`
  - `add_server`
  - `update_server`
  - `remove_server`
  - `set_active_line`
  - `test_lines`
- Web Preview 的服务器 fallback 会保留 line id、默认 User-Agent、单线路 User-Agent、headers、启用状态和测活结果。

## 验证

已通过：

```powershell
npm.cmd run build
npm.cmd run electron:build
rg -n "[ \t]+$" src\platform\index.ts docs\CURRENT_STATE.md docs\CHANGE_LOG\2026-05-31-0721-release-mpv-chapter-jump-smoke.md
```

浏览器验证：

- Vite dev server 打开 `http://127.0.0.1:1420/settings?c=servers` 成功。
- 在 Web Preview 中添加服务器 `Web 预览服务器` 成功，保存后列表显示 `https://preview.test/`。
- 单线路 User-Agent 保存后列表显示 `UA` 标记。
- headers 从 1 条编辑为 2 条后，列表显示 `Headers 2`。
- in-app Browser 控制台 error 数为 0。

## 说明

- Web Preview fallback 是内存态，刷新页面会重置；桌面端仍由 Electron / Tauri 的真实 store 负责持久化。
