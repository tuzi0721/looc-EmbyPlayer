# Phase 3：统一来源、观看历史与分段下载（交接文档）

> 状态：`accepted`  
> 创建日期：`2026-07-13`  
> 前置条件：Phase 2 网络内核与恢复状态机已验收（commit `37dead4`）  

## 1. 目标

Phase 3 建立了统一来源注册表、本地观看历史与离线补偿 outbox、以及分段下载执行器的纯逻辑基础。

## 2. 变更文件清单

### 新增文件

| 文件 | 职责 |
|---|---|
| `electron/backend/sources/registry.mjs` | SourceRegistry、SourceKind、MediaItem、createMediaIdentity、isSameMedia |
| `electron/backend/history/watch-history.mjs` | WatchHistoryStore（本地历史 + outbox 重试） |
| `electron/backend/downloads/segmented-downloader.mjs` | buildManifest、manifestProgress、selectNextSegment、validateManifest、SegmentedDownloadExecutor |
| `scripts/check-phase3-sources.mjs` | Phase 3 测试（15 项） |
| `docs/AI_HANDOFF/PHASE_3_2026-07-13_sources-history-downloads.md` | 本文档 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `package.json` | 新增 `check:phase3-sources` 门禁命令，接入 build 链 |

## 3. 架构设计

### 3.1 统一 Source Backend/Registry

```
SourceRegistry
  ├── register(backend) — 注册 Emby/WebDAV/Alist/Local 适配器
  ├── browse(sourceId, parentId, cursor) — 统一浏览接口
  ├── searchAll(query) — 跨来源搜索
  ├── resolve(sourceId, itemId) — 统一播放地址解析
  └── getItem(sourceId, itemId) — 统一元数据获取

MediaIdentity
  ├── title (normalized)
  ├── year (disambiguation)
  ├── type
  ├── durationMs
  └── sourceRef { sourceId, itemId }

isSameMedia(a, b) — 跨来源同一媒体匹配
```

### 3.2 本地观看历史与离线补偿

```
WatchHistoryStore
  ├── record(event) — 记录 start/progress/stop/complete
  ├── getProgress(mediaIdentity) — 最新进度
  ├── getInProgress() — "继续观看"列表
  ├── getOutbox() — 待同步的远程上报
  ├── markOutboxSent(id) / markOutboxFailed(id, error)
  ├── getRetryableOutbox(maxAttempts) — 指数退避重试
  └── pruneOlderThan(maxAgeDays) — 过期清理

Outbox pattern:
  1. 本地立即记录事件 → UI 可立即响应
  2. 同步队列异步推送到服务器
  3. 失败时指数退避重试
  4. 断网恢复后自动重放
```

### 3.3 分段下载器

```
buildManifest(options)
  ├── 按 segmentSize 切分 segments
  ├── rangeSupported → 多段并行
  └── !rangeSupported → 单段

SegmentedDownloadExecutor
  ├── run() — 顺序/并行下载各段
  ├── cancel() / pause() / resume()
  ├── validateManifest() — 校验完整性
  ├── mergeSegments() — 原子合并
  └── cleanupSegments() — 清理临时文件

Progress:
  ├── downloadedBytes / totalBytes / percent
  ├── completedSegments / failedSegments
  └── isComplete
```

## 4. 测试结果

| 门禁 | 结果 |
|---|---|
| check:secure-credentials | PASS |
| check:electron-security | PASS |
| check:network-policy | PASS (10/10) |
| check:playback-recovery | PASS (20/20) |
| check:phase3-sources | PASS (15/15) |
| check:local-decode | PASS (186 files) |
| check:no-planned-ui | PASS (100 files) |
| vue-tsc --noEmit | PASS |
| vite build | PASS (185 modules, 4.39s) |

## 5. 集成人待办

1. **Source 适配器实现**：为 Emby/WebDAV/Alist/Local 各实现 SourceBackend 接口
2. **观看历史持久化**：将 WatchHistoryStore 的内存数据持久化到磁盘
3. **Outbox 同步器**：实现从 outbox 到 Emby Sessions/Playing/Stopped 的实际 HTTP 调用
4. **下载器 I/O 接入**：将 SegmentedDownloadExecutor 的 fetchSegment/writeSegment/mergeSegments 接入真实 HTTP 和文件系统
5. **下载 UI**：将分段进度接入 DownloadsView

## 6. 提交记录

| SHA | 提交主题 | 已推送 |
|---|---|---|
| `待回填` | `feat(win-p3): source registry, watch history with outbox, segmented downloader` | 是 |

## 7. 回滚策略

- 所有新模块均为纯新增文件
- `package.json` 的 build 链变更可通过移除 `check:phase3-sources` 回滚
- 不影响 Phase 1/2 已有功能

## 8. 残余风险

1. **纯逻辑未接入 I/O**：所有模块均为纯逻辑实现，需要集成人接入实际 HTTP 和文件系统
2. **MediaIdentity 匹配精度**：跨来源匹配仅使用标题+年份，可能需要更复杂的匹配策略
3. **Outbox 重复上报**：网络恢复后 outbox 重放可能导致服务端重复处理，需要幂等保护
