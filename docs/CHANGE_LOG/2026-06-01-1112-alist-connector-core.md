# Alist / OpenList 连接器内核

- **动机**：文件源能力清单里 Alist / OpenList 仍停留在“待接入”。在接 UI 前，先落地真实 API 连接器内核，避免页面按钮先行但没有可验证的目录读取与直链解析。
- **改动**：
  - `electron/backend/alist.mjs` — 新增 Alist / OpenList 客户端，使用 `/api/fs/list` 读取目录，使用 `/api/fs/get` 解析文件 `raw_url`，并生成 `/d/...` 签名直链。
  - `electron/main.mjs` — 注册 `list_alist_folder`、`resolve_alist_file` 与 `play_alist_file` 命令，桌面播放继续走内嵌 mpv。
  - `src/api/index.ts` — 新增 Alist / OpenList 列表、条目和文件解析类型，以及对应 API 调用。
  - `src/platform/index.ts` — Web Preview fallback 接入同一组 Alist / OpenList API，方便本地代理验证真实接口形状。
  - `scripts/smoke-alist-connector.mjs` — 新增本地 mock Alist API，覆盖 token header、目录排序、可播放视频识别、签名下载 URL 和 raw_url 解析。
  - `docs/CURRENT_STATE.md` — 记录 Alist / OpenList 连接器内核已落地，页面入口仍待下一阶段接入。
- **验证**：
  - `node --check electron\backend\alist.mjs`
  - `node --check electron\main.mjs`
  - `node --check scripts\smoke-alist-connector.mjs`
  - `node scripts\smoke-alist-connector.mjs`
  - `npm.cmd run build`
  - `git diff --check`
  - 敏感关键字扫描
- **结果**：通过；连接器内核和 Web Preview fallback 均已编译通过，本地 mock API 已验证目录读取、视频识别、签名直链和 raw_url 解析。
- **风险**：本阶段尚未提供用户页面入口；Alist / OpenList 服务端如果部署在非常规子路径，后续 UI 真实站点验证时仍需覆盖该路径形态。
