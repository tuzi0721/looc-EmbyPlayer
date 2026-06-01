# Alist / OpenList 播放前刷新直链

- **动机**：Alist / OpenList 目录列表中的 `/d/...` 签名直链可能随时间过期；此前点击播放只刷新当前条目，队列里下一条/上一条仍可能保留旧签名 URL。Alist XML 弹幕远程导入也没有携带 API Token，私有站点可能读取失败。
- **改动**：
  - `src/stores/player.ts` — direct queue 的 Alist 条目新增 `baseUrl`、`path`、`pathPassword` 元数据；播放 Alist 队列项前统一调用 `resolve_alist_file` 刷新 raw_url 或签名直链，并同步当前队列 URL。
  - `src/views/AlistView.vue` — 点击播放时不再只解析当前文件，而是把当前目录可播放列表写入队列后交给播放器队列入口统一解析，后续切歌复用同一刷新链路。
  - `src/views/PlayerView.vue` 与 `src/api/index.ts` — 当前 direct queue 条目优先按 `queueIndex` 读取，避免 URL 刷新后侧挂资源匹配失败；Alist XML 弹幕导入会把 token 传给后端。
  - `electron/backend/danmaku.mjs` — 远程 XML 导入支持 token 形式的 `Authorization` header，Basic Auth 仍优先用于 WebDAV。
  - `scripts/smoke-alist-connector.mjs` — mock Alist smoke 新增带 token 的远程 XML 弹幕读取断言。
  - `docs/CURRENT_STATE.md` — 记录 Alist 播放前刷新直链与私有 XML 弹幕读取能力。
- **验证**：
  - `node --check electron\backend\alist.mjs`
  - `node --check electron\backend\danmaku.mjs`
  - `node --check electron\main.mjs`
  - `node --check scripts\smoke-alist-connector.mjs`
  - `node scripts\smoke-alist-connector.mjs`
  - `npm.cmd run check:electron-commands`
  - `npm.cmd run build`
- **结果**：通过；Alist mock smoke 覆盖目录读取、文件解析、侧挂识别，以及带 token 的远程 XML 弹幕导入。
- **风险**：真实 Alist/OpenList 站点如果返回的 `raw_url` 自身还需要额外 cookie 或二次鉴权，仍需要真实站点回归继续补充对应 header 策略。
