# 远程封面代理 smoke

- **动机**：远程文件源封面代理已经接入 Electron 主进程，但需要一个真正经过 `hills-image://file/...` 协议的回归测试，确认私有 WebDAV 图片会带鉴权 header 拉取。
- **改动**：
  - `scripts/smoke-electron-remote-poster-proxy.mjs` — 新增 Electron smoke，启动本地私有 WebDAV mock，目录返回视频与同名 PNG 封面。
  - `scripts/smoke-electron-remote-poster-proxy.mjs` — 通过 Electron renderer 调用 `list_webdav_folder`，断言视频封面 URL 被替换为 `hills-image://file/...`。
  - `scripts/smoke-electron-remote-poster-proxy.mjs` — 在 renderer 中 fetch 该封面 URL，并断言 mock WebDAV 收到带 Basic Auth 的图片 GET。
  - `docs/CURRENT_STATE.md` — 记录远程封面代理已有 Electron 协议级 smoke 覆盖。
- **验证**：
  - 通过：`node --check scripts\smoke-electron-remote-poster-proxy.mjs`
  - 通过：`node scripts\smoke-electron-remote-poster-proxy.mjs`
- **结果**：通过；远程封面代理 smoke 确认私有 WebDAV 同名封面可以由 Electron 主进程带鉴权 header 拉取，前端只接触 `hills-image://file/...`。
- **风险**：当前 smoke 覆盖 WebDAV Basic Auth；Alist Token 代理仍由同一主进程分支和同源限制保护，后续可在有稳定私有 Alist 样本时补真实回归。
