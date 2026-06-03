# 2026-06-02 20:59 Tauri real smoke entry

## 背景
- 现有 `scripts/real-server-visual-smoke.mjs` 只能启动 Electron，并依赖 Electron 专属 `window.hillsLite.invoke("get_embed_state")` 判定 mpv host。
- Tauri/native `mpv-embedded` 路线需要真实账号视检入口，且不能使用本地彩条或页面海报代替播放画面。

## 本阶段变更
- 新增 `HILLS_REAL_APP_MODE`：
  - `electron`：保持原 Electron 路径。
  - `tauri-dev`：启动 `npm.cmd run tauri -- dev --features mpv-embedded`。
  - `tauri-release`：预留启动 `HILLS_REAL_APP_EXE`。
- Tauri 启动时设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=...`，允许脚本通过 CDP 接入 WebView2。
- Tauri smoke 使用临时 `APPDATA` / `LOCALAPPDATA`，避免真实测试账号污染用户当前应用配置。
- `metricsExpression()` 在 Tauri dev 下会动态导入 `/src/api/index.ts` 调用 `api.getState()`。
- seek、退出全屏和 resize 前恢复播放位置均增加 Tauri `api` fallback。
- native capture 在 Tauri 模式下不再强制要求 Electron `get_embed_state`，而是抓取启动进程树内的原生应用窗口，并继续用真实像素判定黑屏/空白。

## 验证
- `node --check scripts\real-server-visual-smoke.mjs` 通过。

## 结论
- 已具备用 Tauri dev + 真实账号跑完整 visual smoke 的入口。
- 下一步立即执行真实服务器、多尺寸、起播后 5 秒验证；通过前仍不能声明播放器问题已解决。
