# 2026-06-01 18:56 登录账号去重与激活状态修复

## 变更

- Electron 持久层新增账号身份去重：同一服务器下相同 `userId` 的账号会被视为同一登录；缺少 `userId` 时回退到用户名。
- Electron 重复登录同一用户时保留已有 account id，刷新 token、头像和 `lastUsedAt`，避免列表里不断堆积重复账号。
- Electron 启动读取旧状态时会自动合并重复账号，并保持 active account 指向合并后的账号。
- Tauri 登录持久层同步按账号身份去重，重复登录不会生成多个同一用户账号。

## 验证

- `node --check electron\backend\store.mjs`
- `node --check electron\backend\emby.mjs`
- Electron store 去重 smoke：两个同服务器同用户账号合并为 1 个，active token 保持最新。
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run check:electron-commands`
- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
