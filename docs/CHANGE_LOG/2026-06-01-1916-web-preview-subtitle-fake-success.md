# 2026-06-01 19:16 Web Preview 在线字幕假成功清理

## 目标
- 清理一个会误导用户的假功能状态：Web Preview 不具备在线字幕搜索/加载能力时，不应返回空结果伪装成搜索成功。

## 改动
- `src/platform/index.ts`
  - `search_online_subtitles` 从固定返回 ASSRT 空结果改为明确报错：Web Preview 不支持在线字幕搜索，请使用桌面版。
  - `resolve_online_subtitle` 同步改为中文明确报错：Web Preview 不支持在线字幕加载，请使用桌面版。
- Electron / Tauri 的真实 ASSRT 搜索、解析、加载实现不变。

## 验证
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：源码落点检查确认 Web Preview 不再返回 `{ provider: "assrt", results: [] }`

## 回滚
- 将 Web Preview fallback 恢复为空结果返回即可；不建议回滚，因为这会再次把未接入状态伪装成搜索成功。
