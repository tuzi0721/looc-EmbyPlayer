# 本机解码策略说明加固

## 背景

用户补充了播放策略的关键原因：多数私人 Emby/Jellyfin 服务端只是 NAS、路由器或低核心数 VPS，即使较强的独服在服务端解码时也可能出现不可接受的高占用。客户端必须由本机承担视频/音频解码，不能把解码或转码压力转嫁给服务端。

## 变更

- `docs/STANDARDS.md` 明确本机解码是硬性产品边界，服务端只给转码源时应失败提示。
- `docs/PROJECT_MEMORY.md` 补充 Direct Stream 只能表示本机解码前提下的静态流 / stream copy，不得退化为服务端解码或 HLS 转码。
- `docs/CURRENT_STATE.md` 同步记录服务端负载原因和当前拒绝不可本机解码源的策略。
- 播放代码不变：当前 Electron / Web Preview / Tauri 链路已经由 `check:local-decode` 覆盖。

## 验证

- 通过：`npm.cmd run check:local-decode`
- 通过：`git diff --check`

## 风险

- 本阶段只更新当前规范和项目记忆，不改变运行时代码。

## 回滚

- 回退本日志与 `docs/STANDARDS.md`、`docs/PROJECT_MEMORY.md`、`docs/CURRENT_STATE.md` 的说明文字即可；不建议回滚，除非产品策略允许服务端转码。
