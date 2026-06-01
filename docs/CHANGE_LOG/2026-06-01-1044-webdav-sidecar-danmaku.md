# WebDAV 同名 XML 弹幕

- **动机**：本地文件夹已支持同名 XML 弹幕自动关联，WebDAV 目录现在也能读取同层文件列表，应该用同一套真实文件名规则识别远程弹幕。
- **改动**：
  - `electron/backend/webdav.mjs` / `src/platform/index.ts` — WebDAV 目录解析识别 `同名.xml`、`同名.danmaku.xml`、`同名.comments.xml` 并关联到可播放视频。
  - `src/api/index.ts` / `src/stores/player.ts` / `src/views/WebDavView.vue` — WebDAV 条目和 direct queue 携带 XML 弹幕候选，列表显示“XML 弹幕”并支持搜索“弹幕 xml”。
  - `electron/backend/danmaku.mjs` / `electron/main.mjs` — `import_danmaku_xml` 支持通过远程 URL 读取 XML，使用 WebDAV 用户名/密码生成 Basic Auth 后复用既有 XML 弹幕解析。
  - `src/views/PlayerView.vue` — WebDAV direct 播放切换后自动尝试导入当前条目的远程 XML 弹幕。
  - `scripts/smoke-webdav-connector.mjs` — mock WebDAV 增加同名 XML 弹幕样本并断言关联。
- **验证**：
  - `node --check electron\backend\webdav.mjs`
  - `node --check electron\backend\danmaku.mjs`
  - `node --check electron\main.mjs`
  - `node --check scripts\smoke-webdav-connector.mjs`
  - `node scripts\smoke-webdav-connector.mjs`
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；WebDAV 目录可以提示同名 XML 弹幕，Electron 桌面播放 WebDAV 视频时会尝试读取并应用远程弹幕。
- **风险**：Web Preview 当前仍只返回空弹幕结果；远程服务端需要允许同一 Basic Auth 凭据读取 XML 文件。
