# 播放器内嵌与退出清理验证

## 背景

用户指出播放器必须内嵌、不能伪全屏、不能无法后退，并且退出应用后不能继续播放或留下无法终止的 mpv/helper 进程。本阶段不改代码，专门用现有 Electron smoke 覆盖这些运行时行为。

## 验证结果

- 通过：`node --check scripts\smoke-electron-embedded-local.mjs`
- 通过：`node scripts\smoke-electron-embedded-local.mjs`
- 后退按钮：播放位置从约 `10600ms` 回到约 `800ms`。
- 真全屏：进入后窗口边界为 `2560x1440`，播放器舞台覆盖整个 viewport，退出后回到窗口模式。
- 自适应：`960x620` 与紧凑窗口下控制栏、播放/后退/全屏按钮可见，无横向溢出。
- 内嵌播放：路由为 `/player/local-embedded-smoke`，舞台尺寸覆盖播放器区域，mpv 截图像素检查通过。
- 退出清理：关闭 Electron 后，测试开始前记录到的 `electron_mpv_host.exe` 与 `mpv.exe` 均已退出，`remaining=[]`。

## 变更

- `docs/CURRENT_STATE.md` 更新播放器当前验证事实。
- 运行时代码不变。

## 风险

- 该 smoke 使用本地假 Emby 与短视频样本验证播放器控制链路，不等同于所有真实服务器线路都可播放；真实线路仍受服务端权限、Cloudflare 或媒体源能力影响。

## 回滚

- 删除本日志并还原 `docs/CURRENT_STATE.md` 的验证摘要即可。
