# 2026-05-29 10:10 截图保存提示优化

## 目标

让播放器截图后的保存提示更短、更适合在底部提示条里阅读，并提供直接打开截图目录的动作。

## 变更

- 播放器截图成功后不再把完整文件路径塞进提示文案，改为显示短文件名，例如 `截图已保存：xxx.png`。
- 播放器在截图提示显示期间保留本次截图路径，并在提示条内提供“打开目录”按钮。
- 新增 `api.openPath(path)` 渲染层接口。
- Electron 主进程新增 `open_path` 命令，使用 `shell.openPath` 打开目标目录并把错误返回给前端。
- Tauri 后端新增同名 `open_path` 命令，使用 `open::that` 打开目标目录。
- 播放器内增加跨 Windows/Unix 风格路径的文件名与目录名解析，供截图提示和打开目录动作复用。

## 验证

已通过：

```powershell
node --check electron\main.mjs
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
npm.cmd run build
npm.cmd run electron:build
rg "[ \t]+$" src\api\index.ts electron\main.mjs src-tauri\src\commands\player.rs src-tauri\src\lib.rs src\views\PlayerView.vue
rg "openPath|open_path|screenshotPath|openScreenshotFolder|打开目录" src electron src-tauri -n
```

说明：`npm.cmd run build` 仍有已知的 PlayerView chunk 超过 500 kB 提示；`npm.cmd run electron:build` 仍有已知的 package author、重复依赖和 Node DEP0190 提示。没有在真实播放器会话里执行截图并人工点击“打开目录”，本段验证覆盖代码路径、类型检查、Rust 检查、前端构建和 Electron dir 打包。

## 当前状态

- 截图成功提示已缩短为文件名。
- “打开目录”动作已同时接入 Electron 与 Tauri 命令层。
- 真实文件管理器打开行为还需要后续在已播放媒体的实际截图场景中做人工确认。
