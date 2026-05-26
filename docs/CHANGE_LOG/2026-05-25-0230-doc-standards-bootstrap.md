# 文档体系 bootstrap — 对齐记忆 vs 实际

- **时间**：2026-05-25 02:30 (UTC+8)
- **动机**：用户确认记忆大体正确，要求补齐「记忆 vs 实际」文档与规范。审计发现旧 `CURRENT_STATE.md` 与磁盘代码严重不符，需重建可信上下文以防会话丢失。

---

## 修改文件

| 文件 | 说明 |
|---|---|
| `docs/PROJECT_MEMORY.md` | **新建** — 主索引：产品意图、技术栈、AI 规范、G1–G9 差距表、文档地图 |
| `docs/STANDARDS.md` | **新建** — 协作细则：会话清单、CHANGE_LOG 模板、构建/品牌/UI/MPV 规范 |
| `docs/ROADMAP/gap-alignment.md` | **新建** — G1–G9 逐项修复计划与建议顺序 |
| `docs/CURRENT_STATE.md` | **重写** — 基于 2026-05-25 代码审计的真实快照；作废旧版错误声称 |
| `docs/CHANGE_LOG/2026-05-25-0230-doc-standards-bootstrap.md` | **新建** — 本文件 |

**未改代码**：本次仅文档，无 Rust/Vue 变更。

---

## 审计结论（关键发现）

1. **品牌**：记忆目标 Hills Lite；代码多为 Emby Player（`MpvBanner` 例外）。
2. **MPV IPC**：记忆要求命名管道；`ipc.rs` 仍为 `fd://0` + stdin/stdout。
3. **内置 mpv**：记忆要求 bundle mpv.exe；仓库仅 `fonts.conf`，`build.rs` 无复制逻辑。
4. **路由**：`FavoritesView` / `AggregateView` 存在但未注册。
5. **打包**：记忆要求只 exe；`tauri.conf.json` 仍 `bundle.active: true`, `targets: all`。
6. **旧 CURRENT_STATE**：错误写入「已与记忆一致」— 已在本轮纠正。

---

## 风险

- 低：纯新增/重写 markdown，不影响运行时。
- 若 AI 仍读旧记忆片段而不读新 `CURRENT_STATE`，可能重复错误判断 — 已在 `PROJECT_MEMORY.md` 显式警告。

---

## 回滚

```powershell
git checkout HEAD -- docs/
# 或删除新建文件，恢复旧 CURRENT_STATE（不推荐）
```

---

## 验证步骤

1. 打开 `docs/PROJECT_MEMORY.md`，确认差距表 G1–G9 存在。
2. 打开 `docs/CURRENT_STATE.md`，确认 MPV 描述为 `fd://0`（非命名管道）。
3. 对照 `src-tauri/src/mpv/ipc.rs` 第 57 行 — 应与文档一致。
4. 新会话 AI：先 `ji 回忆` → 读 PROJECT_MEMORY → CURRENT_STATE → 最新 CHANGE_LOG。

---

## 结果

- ✅ 文档体系骨架已建立
- ⏳ 代码差距 G1–G9 修复待寸止排期
- ⏳ 以下项需用户确认后再动代码：
  - mpv.exe 入库策略（LFS / 本机路径 / 下载脚本）
  - 品牌 rename 是否立即执行
  - `tauri.conf` 关 bundle 是否立即执行
