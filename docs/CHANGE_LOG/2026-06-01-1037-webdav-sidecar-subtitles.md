# WebDAV 同名字幕

- **动机**：WebDAV 已支持目录浏览、播放队列、收藏和列表筛选，但远程目录里的同名字幕只会作为普通文件显示，播放视频时不会自动带入。
- **改动**：
  - `electron/backend/webdav.mjs` / `src/platform/index.ts` — WebDAV 目录解析识别同层 `.srt/.ass/.ssa/.vtt`，按完全同名和语言/版本后缀关联到可播放视频。
  - `src/api/index.ts` / `src/stores/player.ts` — WebDAV 条目和 direct queue 携带匹配到的侧挂字幕列表。
  - `src/views/WebDavView.vue` — 视频行显示侧挂字幕数量，搜索可匹配“字幕”，点击播放时把当前视频字幕列表带入播放器。
  - `electron/main.mjs` — Electron 内嵌 mpv 播放 WebDAV 视频后，用同一 WebDAV 认证头加载匹配到的远程字幕，首条字幕自动选中。
  - `scripts/smoke-webdav-connector.mjs` — mock WebDAV 增加同名字幕样本并断言字幕关联。
- **验证**：
  - `node --check electron\backend\webdav.mjs`
  - `node --check electron\main.mjs`
  - `node --check scripts\smoke-webdav-connector.mjs`
  - `node scripts\smoke-webdav-connector.mjs`
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 目录能提示并携带同名远程字幕，Electron 桌面播放路径会尝试随视频加载字幕。
- **风险**：Web Preview 当前只展示侧挂提示，不实际加载远程字幕；远程服务端必须允许 mpv 使用同一认证头读取字幕文件。
