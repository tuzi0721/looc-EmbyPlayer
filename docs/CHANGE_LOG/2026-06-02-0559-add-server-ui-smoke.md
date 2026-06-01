# 2026-06-02 05:59 - 添加服务器 UI smoke 覆盖

## 变更

- 增强 `scripts\smoke-electron-home-hero.mjs`，在设置页真实打开“添加服务器”弹窗并检查表单结构。
- 新增断言覆盖：用户名、密码、任意端口字段存在；线路名为可选；User-Agent 只在单线路高级设置内；弹窗不再要求服务器名称或手动选择 Emby/Jellyfin 类型。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `node scripts\smoke-electron-home-hero.mjs`

## 结果

- `addServerDialogUi.visible: true`
- `usernameField/passwordField/portField/lineNameOptional/uaInputsInAdvanced: true`
- `hasKindSelect/hasServerNameInput: false`
- 原有首页 smoke 断言仍通过：多服务器收藏/历史/聚合/搜索、图片回退、巨幕、亮色主题、侧边栏折叠和 compact 自适应均为 `ok: true`。
