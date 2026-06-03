# 2026-06-02 21:02 Tauri real smoke blocked by approval

## 背景
- 已具备 `HILLS_REAL_APP_MODE=tauri-dev` 的真实 visual smoke 入口，下一步原本应启动 Tauri/WebView2 GUI 并连接真实 Emby 服务器。

## 本阶段尝试
- 尝试执行真实账号 + Tauri dev + WebView2 remote debugging 的 visual smoke。
- 该操作需要 GUI 启动与外部网络权限。

## 结果
- 权限审批层拒绝执行，错误摘要为：`exceeded retry limit, last status: 429 Too Many Requests`。
- 因该限制来自审批/额度层，不能通过其它命令绕过，也不能把本地彩条、页面截图或静态检查伪装成真实视检。

## 结论
- 真实服务器视检本阶段未执行，播放器不能声明通过。
- 下一步继续做不需要 GUI/外网权限的本地收敛：清理 `mpv-embedded` warning、跑语法/编译门禁，并等待后续可用权限后再跑真实 visual smoke。
