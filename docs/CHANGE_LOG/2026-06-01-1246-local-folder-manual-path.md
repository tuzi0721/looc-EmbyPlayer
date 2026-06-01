# 本地文件夹手动路径

- **动机**：本地文件夹入口只能通过系统选择器进入目录；对于已知盘符路径、已挂载目录或当前系统已经授权的 UNC 共享路径，用户需要能直接粘贴路径复用现有真实扫描链路。
- **改动**：
  - `src/views/LocalFolderView.vue` — `/local-folder` 空状态新增手动路径输入表单，提交后进入对应 `folder` 查询参数并调用既有 `list_local_folder`。
  - `src/views/SettingsView.vue` — 文件服务能力面板新增“手动路径”可用项；SMB 仍保持待接入，只说明已授权 UNC 路径可先通过手动路径打开。
  - `docs/CURRENT_STATE.md` — 记录本地文件夹手动路径入口与 SMB 边界。
- **验证**：
  - 通过：`npm.cmd run build`
  - 通过：in-app Browser 检查 `/local-folder` 空状态显示“手动输入路径”，且页面无横向溢出。
  - 通过：in-app Browser 检查 `/settings?c=file-services` 显示“手动路径”和 SMB 边界说明，且页面无横向溢出。
  - 通过：`git diff --check`
  - 通过：敏感关键字扫描
- **结果**：已落地并验证。
- **风险**：这不是完整 SMB 连接器；没有做共享发现、账号密码保存或独立 SMB 协议栈，只复用系统当前可访问路径。
