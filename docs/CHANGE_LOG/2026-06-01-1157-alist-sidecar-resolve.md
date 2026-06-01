# Alist / OpenList 侧挂资源刷新

- **动机**：上一阶段已经让 Alist / OpenList 视频播放前刷新直链，但同名字幕和 XML 弹幕仍只保存目录列表阶段的签名 URL；当签名过期时，视频可以播放而侧挂资源可能失效。
- **改动**：
  - `src/api/index.ts` — 侧挂字幕和 XML 弹幕模型新增可选 `path` 字段，用于 Alist/OpenList 记录真实文件路径。
  - `electron/backend/alist.mjs` 与 `src/platform/index.ts` — Alist/OpenList 同名字幕、XML 弹幕关联结果携带文件路径；WebDAV 仍保持原有 URL-only 兼容。
  - `src/stores/player.ts` — 播放 Alist direct queue 条目前，会同步刷新视频、同名字幕和 XML 弹幕 URL；侧挂刷新失败时保留原 URL，不阻断主视频播放。
  - `scripts/smoke-alist-connector.mjs` — mock Alist smoke 增加侧挂字幕/XML 路径断言。
  - `docs/CURRENT_STATE.md` — 记录 Alist/OpenList 侧挂资源播放前刷新已落地。
- **验证**：
  - `node --check electron\backend\alist.mjs`
  - `node --check scripts\smoke-alist-connector.mjs`
  - `node scripts\smoke-alist-connector.mjs`
  - `npm.cmd run check:electron-commands`
  - `npm.cmd run build`
- **结果**：通过；构建和 mock Alist smoke 均确认侧挂路径可用，且不会破坏现有命令覆盖。
- **风险**：侧挂资源刷新是 best-effort；如果站点对字幕/XML 使用独立权限、cookie 或特殊代理规则，仍可能需要按具体站点继续补 header 策略。
