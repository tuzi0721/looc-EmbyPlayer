# 2026-06-02 05:49 - 媒体键默认快捷键修正

## 变更

- 将默认全局快捷键 `next_track` / `prev_track` 从 Electron 不识别的 `MediaTrackNext` / `MediaTrackPrevious` 改为 `MediaNextTrack` / `MediaPreviousTrack`。
- `normalizeGlobalShortcuts` 增加旧 accelerator 迁移，已有 `state.json` 或导入配置中的旧值会自动归一化为新值。

## 验证

- `node --check electron\backend\store.mjs`
- `npm.cmd run check:electron-commands`
- `node --input-type=module -e "import { DEFAULT_GLOBAL_SHORTCUTS } from './electron/backend/store.mjs'; console.log(JSON.stringify(DEFAULT_GLOBAL_SHORTCUTS));"`
- `node scripts\smoke-electron-embedded-local.mjs`

## 结果

- 默认快捷键输出为 `MediaNextTrack` / `MediaPreviousTrack`。
- 内嵌播放 smoke `ok: true` / `functionalOk: true`，本机解码合同和退出清理仍通过。
- 本轮 `diagnostics.electronStderr` 未再出现 `failed to register stored global shortcut`。
