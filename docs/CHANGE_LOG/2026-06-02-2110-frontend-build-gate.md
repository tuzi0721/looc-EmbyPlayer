# 2026-06-02 21:10 Frontend build gate

## 背景
- Tauri visual smoke 入口和 `mpv-embedded` 默认后端修改后，需要确认前端类型与生产构建仍通过。

## 验证
- `npm.cmd run build` 通过，包含：
  - `check:local-decode`
  - `check:no-planned-ui`
  - `vue-tsc --noEmit`
  - `vite build`
- 输出中仅有 Vite chunk size 提示，非构建失败。

## 结论
- 前端生产构建门禁通过。
- 因 `dist` 已刷新，下一步需要再次刷新 Tauri release exe，确保 release 内嵌前端资源与当前代码一致。
