# 2026-06-01 15:58 - 未引用图标资源清理

## 变更

- 删除 `src-tauri/icons` 下未被当前桌面构建引用的默认移动端、商店和冗余 PNG 图标。
- 保留 `tauri.conf.json` 与 Electron builder 实际引用的桌面图标：`32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`。
- 本阶段不删除 `src-tauri/gen/schemas`、`public/blackout.html`、随包 mpv 或任何实际功能模块。

## 验证

- 通过：图标引用扫描，已删除图标无代码、配置或文档引用。
- 通过：`npm.cmd run build`
- 通过：`npm.cmd run electron:build`
- 通过：`npm.cmd run tauri:build`
- 通过：`git diff --check`，仅提示 Windows 工作区行尾转换。

## 备注

- 这次只清理确定未被当前桌面发布链路引用的静态资源；后续功能代码清理继续按“先证明无人引用，再删除”的节奏推进。
