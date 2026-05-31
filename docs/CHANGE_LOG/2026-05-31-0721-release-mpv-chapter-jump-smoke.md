# 2026-05-31 07:21 Electron release mpv 章节跳转真实冒烟

## 目标

为章节菜单补齐真实媒体验证：找到一个带章节的测试条目，用 Electron release 随包 mpv 加载并执行章节跳转。

## 验证

已通过脱敏联网播放冒烟：

```powershell
@'
<redacted real mpv chapter smoke>
'@ | node --input-type=module -
```

结果：

- 登录成功，未把访问 token、密码、鉴权 header 或完整播放 URL 写入仓库文档。
- 章节样本条目：`16240`，`mediaSourceId = mediasource_16240`。
- `resolveMpv()` 命中 `release-electron\win-unpacked\resources\mpv\mpv.exe`。
- mpv IPC 快照返回 `durationMs = 1429977`。
- `chapter-list` 返回 3 个章节：
  - `0ms`：Opening
  - `90007ms`：Story
  - `1339965ms`：Ending
- 跳转到第二章 Story：
  - 目标位置 `90007ms`
  - 跳转后 `positionMs = 90007`
  - `activeChapter = 1`
  - 与目标误差小于 2 秒

## 结论

- Electron release 随包 mpv 的真实章节读取与章节跳转链路已验证通过。
- 播放器章节菜单依赖的 `snapshot.chapters` / `snapshot.chapter` 数据在真实流里可用。
