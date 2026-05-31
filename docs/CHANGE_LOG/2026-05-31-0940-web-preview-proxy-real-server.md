# Web Preview 代理真实线路修正

## 背景

Web Preview 新增本地代理后，本地 fake Emby 能走通，但真实 443 线路公开探测仍返回 `fetch failed`。原因是 Vite dev server 里的 Node `fetch` 不会自动使用浏览器或 Windows 当前代理，而用户的真实线路需要经本机代理访问。

## 改动

- `/__hills_web_proxy` 的服务端请求增加直连失败后的代理 fallback。
- 代理候选优先读取 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY` 等环境变量；未配置时尝试常见本机代理端口 `127.0.0.1:7897` 和 `127.0.0.1:7890`。
- 使用 `undici` 的 `ProxyAgent` 只作用于 Vite Web Preview 代理，不影响 Electron/Tauri 正式后端请求路径。

## 验证

- `npm.cmd run build`
- 通过 `/__hills_web_proxy` 访问本地 fake Emby `/System/Info/Public`，返回 200。
- 通过 `/__hills_web_proxy` 对两条真实线路执行 `/System/Info/Public` 公开探测，均返回 200，并识别到同一 Emby 服务器版本信息。
- 使用用户提供的测试账号经当前 Web Preview 代理完成真实登录；登录返回有效用户 ID 和访问令牌，并能拉到 5 个媒体库视图。

## 结果

Web Preview 在需要本机代理的真实网络环境下也能识别 Emby/Jellyfin、登录并拉媒体库。日志未写入测试账号、密码、token 或完整播放地址。
