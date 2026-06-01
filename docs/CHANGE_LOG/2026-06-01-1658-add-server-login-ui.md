# 添加服务器登录表单修正

- **时间**：2026-06-01 16:58 (UTC+8)
- **动机**：用户反馈添加服务器时看不到账号、密码和端口入口，且服务端名称、类型和 UA 暴露在主流程中会误导；添加流程应突出真实登录与线路地址，服务端名称和 Emby/Jellyfin 类型由探测自动取得，新增服务器必须追加到列表。
- **修改文件**：
  - `src/components/login/AddServerDialog.vue`：重写添加服务器弹窗文案和布局，主流程只保留账号、密码、线路地址和端口；线路名、User-Agent、Headers 移入“高级设置”；提交时仍先自动识别 Emby/Jellyfin，再保存服务器并按需登录。
  - `src/utils/serverUrl.ts`：修复端口和协议错误提示的乱码文案，保留任意 1-65535 端口校验。
- **风险**：仅调整添加弹窗和错误提示，不改变后端存储结构；真实网络登录仍取决于用户填写的线路、端口和反代可达性。
- **回滚**：恢复上述两个文件即可回到旧弹窗。
- **验证步骤**：
  - `npm.cmd run build`
  - 添加服务器弹窗与端口提示乱码扫描
  - `git diff --check`
  - 尝试连接 in-app Browser 目检
  - `npm.cmd run electron:build`
- **结果**：前端构建与 Electron unpacked 打包通过，添加服务器弹窗不再包含旧乱码；底层仍调用 `detect_server` 自动识别服务端类型和名称，`add_server` 在 Web Preview/Electron/Tauri 路径中均为新增服务器记录而非替换旧列表。in-app Browser 本轮仍返回无可用路由，未完成截图目检。
