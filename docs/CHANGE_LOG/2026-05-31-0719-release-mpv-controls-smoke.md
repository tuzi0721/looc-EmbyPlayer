# 2026-05-31 07:19 Electron release mpv 控制项真实冒烟

## 目标

继续用真实线路1媒体和 Electron release 随包 mpv，验证截图、字幕轨切换和 mpv Stats OSD 不是只停留在构建级检查。

## 验证

已通过脱敏联网播放冒烟：

```powershell
@'
<redacted real mpv controls smoke>
'@ | node --input-type=module -
```

结果：

- 登录成功，未把访问 token、密码、鉴权 header 或完整播放 URL 写入仓库文档。
- `resolveMpv()` 命中 `release-electron\win-unpacked\resources\mpv\mpv.exe`。
- 测试条目 `21648` 在线路1以 `mpv-direct-static` 加载。
- mpv IPC 快照返回：
  - `durationMs = 866026`
  - `positionMs = 1167`
  - 视频轨 1 条、音频轨 1 条、字幕轨 2 条
  - 章节 0 条
- 字幕轨切换：
  - 设置 `sid = 1` 成功。
  - 读取 `sid` 返回 `1`。
  - 设置 `sid = no` 成功，读取结果为关闭状态。
- mpv Stats OSD：
  - `script-binding stats/display-page-1` 成功。
- 截图：
  - `screenshot-to-file` 成功生成临时 PNG。
  - 文件体积 `6990409` bytes。
  - 校验后已删除临时截图文件，未保留视频画面。

## 结论

- Electron release 随包 mpv 的真实控制链路已覆盖基础播放、字幕轨切换、Stats OSD 和截图。
- 当前测试媒体没有章节，因此章节菜单仍需要带章节媒体才能做真实跳转验证。
