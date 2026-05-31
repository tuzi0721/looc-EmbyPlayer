# 2026-05-30 01:45 Electron 运行时依赖打包清理

## 目标

清理 `npm.cmd run electron:build` 中长期存在的 duplicate dependency references 与 Node DEP0190 输出，让发布验证日志只保留真实打包信息。

## 变更

- 将 Vue、Pinia、hls.js、Tauri JS API 等渲染层依赖从 `dependencies` 移到 `devDependencies`；这些依赖会被 Vite 打入 `dist`，Electron 运行时不需要复制对应 `node_modules`。
- 保留根 `dependencies` 为空对象，并用 `npm.cmd install --package-lock-only` 同步 `package-lock.json` 根依赖元数据。
- 新增 `electron/before-build.mjs`，通过 Electron builder 的 `beforeBuild` hook 返回 `false`，明确声明运行时 `node_modules` 已由项目外部处理，从而跳过生产依赖收集。
- Electron 打包仍保留 `dist/**`、`electron/**`、`package.json` 与随包 `resources/mpv`。

## 验证

已通过：

```powershell
node --check electron\before-build.mjs
package.json / package-lock.json JSON 解析检查
npm.cmd ls --include=prod --omit=dev --depth=0
npm.cmd install --package-lock-only
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
app.asar node_modules 条目检查
app.asar package.json 依赖检查
```

结果：`npm.cmd run electron:build` 不再输出 duplicate dependency references、Node DEP0190 或空依赖 traversal fallback；`release-electron\win-unpacked\resources\app.asar` 中 `node_modules` 条目为 0，打包内 `package.json` 的 `dependencies` 为 `{}`。

## 当前状态

- Electron 发布链路的依赖扫描噪声已清理。
- 当前 Electron 运行时依赖模型是“渲染层由 Vite bundle，主进程/preload 使用 Electron、Node 内置模块和本地文件”。
- 后续如果主进程新增真正的第三方运行时 Node 依赖，需要重新评估 `beforeBuild` hook 和 `dependencies` 分组。
