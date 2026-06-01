# 远程文件源封面代理

- **动机**：WebDAV 与 Alist/OpenList 已能识别同名远程封面，但私有站点的图片可能需要 Basic Auth 或 API Token；普通 `<img>` 不能附加这些 header，容易只显示回退图标。
- **改动**：
  - `electron/main.mjs` — `list_webdav_folder` 与 `list_alist_folder` 返回目录前，会把同源远程封面注册到主进程内存映射并替换成 `hills-image://file/...`。
  - `electron/main.mjs` — `hills-image` 协议新增远程文件图片分支，通过主进程 fetch 附加 WebDAV Basic Auth 或 Alist Token header，并继续复用图片缓存。
  - `electron/main.mjs` — 有鉴权 header 时仅代理与连接根地址同源的封面；外部 `thumb` 域名保留原 URL，避免把站点凭据发给第三方。
  - `docs/CURRENT_STATE.md` — 记录远程文件源封面在 Electron 桌面端可走鉴权图片代理。
- **验证**：
  - 通过：`node --check electron\main.mjs`
  - 通过：`npm.cmd run check:electron-commands`
  - 通过：`node scripts\smoke-webdav-connector.mjs`
  - 通过：`node scripts\smoke-alist-connector.mjs`
  - 通过：`npm.cmd run build`
- **结果**：通过；桌面端 WebDAV / Alist 同源封面可通过主进程带鉴权 header 拉取，前端不需要把密码或 token 写入图片 URL。
- **风险**：Web Preview 仍只能直接使用服务端返回的图片 URL；需要鉴权 header 的远程封面实际加载以 Electron 桌面端为准。
