# 2026-05-31 08:32 服务器识别与登录一条流

## 背景

用户指出添加服务器流程缺少端口、账号和密码入口，并且 Emby / Jellyfin 类型应该自动识别。原流程需要先保存服务器再跳到登录页，Web Preview 也没有真实账号态 fallback，容易被误判为“没有登录成功”。

## 变更

- 添加服务器弹窗改为“服务器 + 账号”一条流：
  - 类型默认“自动”，也可手动选择 Emby / Jellyfin。
  - 每条线路新增独立端口输入，地址与端口会合成为真实 baseUrl。
  - 弹窗内直接提供用户名和密码；填写后主按钮变为“保存并登录”。
- 新增 `detect_server` 平台 API：
  - Electron 通过 `/System/Info/Public` 探测可用线路并识别 Emby / Jellyfin。
  - Tauri 复用 Rust `system_info_public` 探测逻辑。
  - Web Preview 提供内存 fallback，便于浏览器预览验证表单和登录态。
- `add_server` 支持带入 `activeLineId`，自动探测命中的线路会成为活动线路。
- Web Preview 补齐 `login` / `list_accounts` / `switch_account` / `logout` 内存账号态，登录后侧边栏能看到已连接状态。
- 侧边栏和登录页的添加服务器回调支持“已登录”分支，填写账号密码的情况下不再把用户送回重复登录页。

## 验证

- `node --check electron\backend\emby.mjs`
- `node --check electron\main.mjs`
- `npm.cmd run check:electron-commands`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- Electron 自动识别 smoke：伪造 Jellyfin `System/Info/Public`，确认返回 `kind = jellyfin` 与命中线路。
- 真实测试账号登录 smoke：443 线路可被自动识别并完成登录，返回账号态；验证输出未包含密码、token 或完整播放地址。
- In-app browser 验证：`http://127.0.0.1:1420/settings?c=servers` 新版添加服务器弹窗可见自动类型、端口、用户名和密码输入。
- `npm.cmd run electron:build`

## 结果

服务器添加、端口输入、自动识别和账号登录已形成闭环。播放窗口内嵌仍是下一阶段优先项。
