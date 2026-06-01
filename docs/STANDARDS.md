# Hills Lite 工程与协作规范

本文件记录当前项目执行规范。若与用户最新消息冲突，以用户最新消息为准。

---

## 1. 会话启动

1. 先看 `git status --short --branch`，不要覆盖用户未提交改动。
2. 阅读 `docs/CURRENT_STATE.md`。
3. 阅读 `docs/PROJECT_MEMORY.md`。
4. 阅读 `docs/CHANGE_LOG/` 中时间最新的一条。
5. 涉及 UI 或播放时，优先查真实代码和现有 smoke，不依赖旧归档文档下判断。

---

## 2. 变更流程

每个小阶段都要闭环：

1. 做最小可验证改动。
2. 新增 `docs/CHANGE_LOG/<YYYY-MM-DD-HHmm>-<slug>.md`。
3. 更新 `docs/CURRENT_STATE.md`。
4. 运行与改动匹配的验证。
5. `git diff --check`。
6. 提交。
7. 推送到 `origin main`。
8. 用 `git ls-remote origin refs/heads/main` 确认远端。
9. 立即进入下一轮，除非用户要求暂停。

---

## 3. 构建与验证

Windows 环境优先使用 `npm.cmd`。

常用命令：

```powershell
npm.cmd run check:local-decode
npm.cmd run check:no-planned-ui
npm.cmd run build
npm.cmd run electron:build
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
git diff --check
```

Electron 桌面 smoke：

```powershell
node --check scripts\smoke-electron-embedded-local.mjs
node scripts\smoke-electron-embedded-local.mjs
node --check scripts\smoke-electron-home-hero.mjs
node scripts\smoke-electron-home-hero.mjs
```

`npm.cmd run build` 已前置执行本机解码门禁和 UI 占位入口门禁。

---

## 4. UI 规范

- 首页第一屏必须展示真实媒体库内容，不做营销页。
- 巨幕内容来源应包含真实 Backdrop、Primary 海报和简介；不能只放装饰背景。
- 主导航只放高频入口；下载、通知、遥控等工具集中到设置页。
- 添加服务器主流程包含用户名、密码、线路地址和端口；服务端名称和类型自动探测。
- User-Agent 和 headers 只放在线路高级设置中。
- 设置页不要展示不能立即触发或不能配置的产品入口。
- 弹窗使用 `Teleport to="body"`，并保证窄窗口底部按钮可见。
- 播放页全屏时视频舞台铺满 viewport，控制栏作为覆盖层。

---

## 5. 播放规范

- mpv 固定为应用随包播放核心。
- 禁止恢复系统 PATH mpv、用户 mpv 路径选择、构建期下载 mpv 或旧 vendor fallback。
- Electron 打包必须带 `resources\mpv` 与 `electron_mpv_host.exe`。
- 播放窗口必须内嵌在应用内，外部播放器只能作为显式用户动作。
- 退出应用或关闭播放窗口后，不应留下本项目 mpv / helper 进程。

---

## 6. 本机解码规范

播放协商必须坚持：

- Direct Play / Direct Stream only。
- `EnableTranscoding=false`。
- 视频/音频 stream copy 开关保持启用。
- 空 `TranscodingProfiles`。
- 静态流 URL。
- 媒体源必须明确支持本机直连或本机直流。

服务端只给转码源时应该失败提示，而不是请求服务端转码。

---

## 7. Git 与安全

- 不使用 `git reset --hard` 或 `git checkout --` 回滚用户改动。
- 不 force push `main`。
- 只 stage 本阶段相关文件。
- 不把账号、密码、token、完整真实线路 URL 或完整播放 URL 写入文档、日志或测试脚本。
- 真实服务器测试结果要脱敏记录。

---

## 8. 文档规则

`CURRENT_STATE.md` 只写当前事实，不再堆历史流水。历史过程写在 `CHANGE_LOG/`。

阶段日志至少写清：

- 背景
- 变更
- 验证
- 风险
- 回滚方式（适用时）
