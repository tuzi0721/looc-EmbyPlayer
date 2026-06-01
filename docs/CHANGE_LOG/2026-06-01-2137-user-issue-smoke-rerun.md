# 用户问题清单 smoke 复核

## 背景

在服务器设置、侧边栏清理、旧脚本清理和 Electron unpacked 包刷新之后，重新跑一遍覆盖用户重点问题的 Electron smoke，确认首页巨幕、收藏/历史/聚合、播放器内嵌、后退、真全屏、自适应和退出清理仍然闭环。

## 验证

- 通过：`node scripts\smoke-electron-home-hero.mjs`
  - `/home` 巨幕来自真实媒体库候选。
  - 巨幕标题、简介、Backdrop 背景和 Primary 海报均已加载。
  - `firstRunVisible=false`。
  - 巨幕高度 `689px`，测试 viewport 高度 `761px`，满足高度约束。
  - `/favorites`、`/history`、`/aggregate` 均渲染 fake Emby 数据且无错误文本。
- 通过：`node scripts\smoke-electron-embedded-local.mjs`
  - 内嵌播放器路由为 `/player/local-embedded-smoke`。
  - 后退从约 `10633ms` 回到约 `900ms`。
  - 真全屏进入后窗口为 `2560x1440`，播放器舞台覆盖 viewport。
  - `960x620` 与紧凑窗口下控制栏可见，无横向溢出。
  - mpv 截图像素检查通过。
  - 关闭 Electron 后 `remaining=[]`，无 `mpv.exe` / `electron_mpv_host.exe` 残留。

## 变更

- `docs/CURRENT_STATE.md` 更新最新复核事实。
- 运行时代码不变。

## 风险

- 本轮 smoke 使用本地假 Emby 服务和短视频样本，证明客户端链路闭环；真实服务器仍可能受账号权限、线路策略、Cloudflare 或媒体源能力影响。

## 回滚

- 删除本日志并还原 `docs/CURRENT_STATE.md` 的最新阶段描述即可。
