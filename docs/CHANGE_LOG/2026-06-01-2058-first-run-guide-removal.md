# 首页首屏阻塞引导清理

## 背景

首页 smoke 通过后截图仍显示“开始使用 Hills Lite”引导层盖住真实巨幕。用户当前更需要直接看到媒体库巨幕、收藏、历史和聚合内容，而不是被启动说明遮挡；主界面也不应继续保留无关引导入口。

## 变更

- 删除 `FirstRunGuide` 组件，不再在首页或其他主界面自动弹出首启引导。
- 移除 TypeScript / Web Preview / Electron / Tauri 设置模型中的 `firstRunCompleted` / `first_run_completed` 字段。
- 依靠现有设置归一化过滤旧配置中的 `firstRunCompleted` 字段。
- `smoke-electron-home-hero.mjs` 增加断言：首屏巨幕验证时不得出现 `.first-run` 遮挡层。
- `docs/CURRENT_STATE.md` 同步当前首页首屏行为。

## 验证

- 通过：`rg -n "firstRunCompleted|first_run_completed|FirstRunGuide|开始使用 Hills Lite" src electron src-tauri --glob "!src-tauri/target/**"` 无残留输出。
- 通过：`rg -n "firstRunVisible|first-run guide blocks" scripts\smoke-electron-home-hero.mjs` 确认 smoke 已覆盖首屏遮挡断言。
- 通过：`node scripts\smoke-electron-home-hero.mjs`，首页巨幕使用真实媒体候选，`firstRunVisible=false`，海报图片 `naturalWidth=64`，收藏/历史/聚合均渲染假 Emby 数据。
- 通过：`node --check electron\backend\store.mjs`
- 通过：`npm.cmd run check:local-decode`
- 通过：`npm.cmd run check:no-planned-ui`
- 通过：`npm.cmd run build`
- 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- 通过：`git diff --check`

## 风险

- 首次打开应用不会再出现三按钮引导；添加服务器、登录和设置仍由首页空态、侧边栏和设置页承接。

## 回滚

- 恢复 `FirstRunGuide.vue`、`App.vue` 引用与 `firstRunCompleted` 设置字段，并移除 smoke 的 `.first-run` 断言。
