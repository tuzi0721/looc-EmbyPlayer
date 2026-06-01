# 2026-06-01 19:26 Web Preview 桌面命令假成功清理

## 背景

Web Preview 里仍有部分桌面壳能力会返回成功值，但浏览器环境实际上无法完成，例如打开本地目录、窗口置顶、mpv OSD、副屏遮黑和原生全屏。这类返回值会误导调试和用户判断。

## 变更

- 新增 Web Preview 桌面命令失败 helper，无法在浏览器中真实执行的桌面命令改为明确报错。
- `open_download_directory`、`open_path`、`show_mpv_stats_osd`、`set_always_on_top`、`set_secondary_subtitle_track`、`set_secondary_display_blackout`、`set_fullscreen` 不再返回假成功。
- `open_external` 改为浏览器中真实打开 `http(s)` / `mailto` 链接；其它协议明确报错，避免 `ms-settings:` 等桌面协议在 Web Preview 里静默失败。

## 验证

- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
