# 2026-06-03 05:48 MPV import lib cleanup

## 背景
- 生成 MSVC `mpv.lib` 时，VS `lib.exe` 同时产出了临时 `mpv.exp`。
- `mpv.lib` 是 Tauri/native `mpv-embedded` 链接随包 `libmpv-2.dll` 所需的 import library；`mpv.exp` 不是运行或构建所需文件。

## 本阶段变更
- 删除 `src-tauri/resources/mpv/mpv.exp`。
- 保留 `src-tauri/resources/mpv/mpv.lib`。

## 验证
- `Test-Path src-tauri\resources\mpv\mpv.exp` 返回 `False`。
- `git status --short` 中不再出现 `mpv.exp`，仍出现应提交的 `src-tauri/resources/mpv/mpv.lib`。

## 结论
- 已清理生成 import library 时留下的无关临时副产物。
- 下一步继续重试 Tauri/native 真实服务器 visual smoke。
