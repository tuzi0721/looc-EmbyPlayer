# 2026-05-30 01:00 播放器快捷键中央分发

## 目标

把播放器页内快捷键从视图内硬编码迁到共享定义，避免设置页说明和真实按键行为继续分叉，并为后续可自定义/可解绑的页内快捷键打基础。

## 变更

- 新增 `src/utils/keyboardShortcuts.ts`，集中管理播放器快捷键动作、组合键、说明文案和按键匹配工具。
- `useKeyboard.ts` 改为复用共享的组合键标准化、事件匹配和输入框跳过逻辑。
- `PlayerView.vue` 将快捷键监听改为动作分发表，所有处理函数由 `PLAYER_SHORTCUTS` 映射到播放器动作。
- `ShortcutsPanel.vue` 的“播放页内”快捷键说明改为读取 `PLAYER_SHORTCUT_SUMMARY`，不再维护第二份静态列表。
- 修正 `+` 键的标准化解析，避免原先 `split("+")` 导致单独 `+` 组合键不稳定。

## 验证

已通过：

```powershell
PLAYER_SHORTCUTS / PLAYER_SHORTCUT_SUMMARY / useKeyboard 落点检查
+ 键解析落点检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。未在真实播放会话中逐个按键人工实测。

## 当前状态

- 播放器快捷键监听和设置页说明共用同一份快捷键定义。
- 播放器页内按键仍保持原有行为。
- 后续若做页内快捷键自定义，可以继续在该共享模块上接持久化配置。
