# 关闭到托盘旧设置清理

## 背景

用户指出最严重的问题是退出应用后播放仍在继续。当前 Electron 主窗口关闭链路已经会触发 runtime cleanup 并等待 mpv/helper 退出，但设置页仍保留“关闭时最小化到托盘”旧开关，容易让用户把关闭和隐藏混在一起，也会让旧配置继续传播。

## 变更

- 移除设置页“关闭时最小化到托盘”开关。
- 移除 TypeScript / Web Preview / Electron / Tauri 设置模型里的 `closeToTray` / `close_to_tray` 字段。
- Electron store 新增设置白名单归一化，读取、更新、导出、导入配置时会过滤旧设置字段。
- Electron desktop integration 删除该旧设置读取逻辑；托盘继续保留显式“显示窗口 / 隐藏窗口 / 退出”菜单。
- `docs/CURRENT_STATE.md` 同步记录关闭语义。

## 验证

- 通过：`rg -n "closeToTray|close_to_tray|关闭时最小化到托盘" src electron src-tauri --glob "!src-tauri/target/**"` 无残留输出。
- 通过：`node --check electron\backend\store.mjs`
- 通过：`node --check electron\backend\desktop.mjs`
- 通过：`node --check electron\main.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`npm.cmd run check:no-planned-ui`
- 通过：`npm.cmd run build`
- 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- 通过：`npm.cmd run check:electron-commands`
- 通过：`git diff --check`
- 通过：`Get-Process mpv,"Hills Lite","hills-lite-helper"` 未发现残留播放/helper 进程。

## 风险

- 旧配置文件里可能仍有 `closeToTray` / `close_to_tray` 字段，但运行时会忽略；用户需要隐藏窗口时仍可使用托盘显式菜单。
