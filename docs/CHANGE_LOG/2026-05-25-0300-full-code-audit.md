# 全量代码审计完成

- **时间**：2026-05-25 03:00 (UTC+8)
- **动机**：用户要求「完全遍历代码确定状态后再修改」；在 doc bootstrap 基础上完成 Rust+Vue 全量审计。

---

## 修改文件

| 文件 | 说明 |
|---|---|
| `docs/AUDIT_FULL_2026-05-25.md` | **新建** — 53 Rust 文件 + 前端完整清单、70 命令、58 API、孤儿代码、G1–G13 差距 |
| `docs/PROJECT_MEMORY.md` | 文档地图增加 AUDIT 链接 |
| `docs/CHANGE_LOG/2026-05-25-0300-full-code-audit.md` | 本文件 |

**未改代码**。

---

## 关键新发现（相对 bootstrap）

| ID | 发现 |
|---|---|
| G10 | `MpvBanner.vue` 未挂载，且 `detectMpv`/`openExternal` 前后端均不存在 |
| G11 | 无 `set_favorite` 命令；DetailView 无收藏按钮；FavoritesView 只读 |
| G12 | `hardwareDecoding` / `mpvCacheMb` 仅存 settings，mpv 模块未读取 |
| G13 | 审计完成，满足「先确定状态再改」前提 |

旧 CURRENT_STATE 声称的 `set_favorite` / `probe_server` / `detect_mpv` — **均不存在**。

---

## 用户决策记录

- mpv.exe：**不进 Git**，build.rs 从 URL 或本机路径复制
- 允许 AI：总结文档、测试脚本、编译、运行

---

## 验证

1. 打开 `docs/AUDIT_FULL_2026-05-25.md` §2.2 — 确认 70 命令列表
2. grep `detect_mpv` src-tauri — 应为 0 匹配
3. 读 `PlayerView.vue` back() — 确认仍 `await player.stop()`

---

## 结果

✅ 全量审计完成，可以按 §6 建议顺序进入代码修改阶段（待寸止确认首项任务）
