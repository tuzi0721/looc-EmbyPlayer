# 2026-05-31 14:11 - 截图避让重置
## 本段目标
- 截图前重置播放器控制层造成的内嵌视频避让区域，避免截图继承当前控制栏显示状态下的压缩/避让画面。

## 变更
- `src/views/PlayerView.vue` 新增截图前的干净帧准备流程：清理控制栏隐藏计时器、关闭临时面板、收起顶部/底部控制层、等待渲染帧并强制同步 embedded mpv rect。
- 截图完成或失败后统一恢复控制层提示计时，保留原有“截图已保存 / 失败”提示与复制路径、打开目录动作。
- 播放器卸载时复用同一计时器清理函数，避免截图中途离开页面后遗留隐藏计时器。

## 验证
- `npm.cmd run build` 通过。
- `git diff --check` 通过；仅有 Windows LF/CRLF 提示，无行尾空白错误。
- `npm.cmd run electron:build` 通过；`check:electron-commands` 仍为 91/91，Electron unpacked 产物包含 6 个随包 mpv 文件、`electron_mpv_host.exe` 和 `app.asar`。
- 本轮未做真实播放器截图文件的人工视觉对比；该改动已覆盖截图前控制层/嵌入 rect 状态重置链路。
