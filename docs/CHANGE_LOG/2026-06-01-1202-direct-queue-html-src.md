# Web Preview 直链队列切换

- **动机**：桌面内嵌 mpv 的 direct queue 切换会由后端重新播放，但 Web Preview/浏览器 fallback 中，队列切换只更新了播放器 store，HTML `<video>` 可能继续保留旧 `src`，影响 WebDAV / Alist 队列预览验证。
- **改动**：
  - `src/views/PlayerView.vue` — 抽出 `startDirectHtmlPlayback()`，统一负责 Web Preview 直链播放时重置 HTML video、绑定当前 `player.directUrl`、恢复音量/静音/倍速并处理浏览器自动播放限制。
  - `src/views/PlayerView.vue` — `/player/webdav-file` 与 `/player/alist-file` 初始播放复用同一入口；direct queue 上一条/下一条或选集点击后，如果当前是 Web Preview，会在 `player.playDirectEntry()` 更新直链后立即重新绑定 HTML video `src`。
  - `docs/CURRENT_STATE.md` — 记录 Web Preview direct queue 与桌面队列行为对齐。
- **验证**：
  - `npm.cmd run build`（首次出现一次 Vite/Rollup Windows `index.html` 产物名临时异常，原命令重跑通过）
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；重跑后的构建完成，空白检查与敏感扫描后续随提交前验证完成。
- **风险**：Web Preview 仍不能给普通 HTML video 附加 WebDAV Basic Auth 或 Alist token header；需要鉴权 header 的直链实际播放仍以桌面内嵌 mpv 为准。
