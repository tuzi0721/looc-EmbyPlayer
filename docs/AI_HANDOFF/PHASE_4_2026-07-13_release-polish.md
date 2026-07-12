# Phase 4：片头/片尾识别、更新流程与发布管线（交接文档）

> 状态：`accepted`  
> 创建日期：`2026-07-13`  
> 前置条件：Phase 3 来源注册表与分段下载已验收（commit `f0cec61`）  

## 1. 目标

Phase 4 建立了片头/片尾自动检测与跳过框架、带完整性校验的应用更新流程、以及发布/升级/回滚管线。

## 2. 变更文件清单

### 新增文件

| 文件 | 职责 |
|---|---|
| `electron/backend/playback/intro-detection.mjs` | SkipMarkerStore、MarkerType、detectFromSilence、applyDetectionResult |
| `electron/backend/updates/update-manager.mjs` | UpdateManager、isNewerVersion、verifyChecksum |
| `electron/backend/updates/release-pipeline.mjs` | ReleasePipeline、ReleaseStage、MigrationRegistry |
| `scripts/check-phase4-release.mjs` | Phase 4 测试（16 项） |
| `docs/AI_HANDOFF/PHASE_4_2026-07-13_release-polish.md` | 本文档 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `package.json` | 新增 `check:phase4-release` 门禁命令，接入 build 链 |

## 3. 架构设计

### 3.1 片头/片尾识别

```
SkipMarkerStore
  ├── setMarker(mediaIdentity, type, positionMs, options)
  ├── getSkipRanges(mediaIdentity) → [{ startMs, endMs, type, confidence }]
  ├── getSkipRangeAt(mediaIdentity, positionMs, toleranceMs)
  └── clearMarkers(mediaIdentity)

DetectionResult
  ├── introStartMs / introEndMs
  ├── outroStartMs / outroEndMs
  ├── confidence (0-1)
  ├── method ("silence" | "blackframe" | "chapter" | "hash")
  └── metadata

detectFromSilence(audioLevels, options)
  ├── Find silence gaps ≥ minSilenceMs below thresholdDb
  ├── First gap in intro range → intro markers
  └── Last gap in outro range → outro markers

applyDetectionResult(store, mediaIdentity, result)
  └── Auto-detected markers with source="auto"
```

### 3.2 更新流程与完整性校验

```
UpdateManager
  ├── check() → UpdateInfo | null
  │     └── isNewerVersion(remote, current) — semver comparison
  ├── downloadAndVerify()
  │     ├── Download with progress callback
  │     └── verifyChecksum(buffer, expected, "sha256")
  ├── getStagedPath() — for installer to apply on next launch
  └── reset()

States: IDLE → CHECKING → AVAILABLE → DOWNLOADING → VERIFYING → READY
                                                         ↘ FAILED
```

### 3.3 发布/升级/回滚管线

```
ReleasePipeline
  ├── createRelease(version, { changelog }) → BUILT
  ├── markTested(version) → TESTED
  ├── stageRelease(version) → STAGED
  ├── release(version) → RELEASED (sets currentVersion)
  ├── rollback(reason) → ROLLED_BACK (reverts to previousVersion)
  └── getHistory() — audit trail

MigrationRegistry
  ├── register(fromVersion, toVersion, migrationFn)
  ├── migrate(fromVersion, toVersion, data) — runs migration chain
  └── _findPath(from, to) — BFS through migration graph
```

## 4. 完整构建门禁总览

| # | 门禁 | 测试数 | 结果 |
|---|---|---|---|
| 1 | check:secure-credentials | 6 | PASS |
| 2 | check:electron-security | 5 | PASS |
| 3 | check:network-policy | 10 | PASS |
| 4 | check:playback-recovery | 20 | PASS |
| 5 | check:phase3-sources | 15 | PASS |
| 6 | check:phase4-release | 16 | PASS |
| 7 | check:local-decode | 190 files | PASS |
| 8 | check:no-planned-ui | 103 files | PASS |
| 9 | vue-tsc --noEmit | — | PASS |
| 10 | vite build | 185 modules | PASS (4.42s) |
| | **总计** | **72 项测试** | **全绿** |

## 5. 集成人待办

1. **片头/片尾检测接入**：从 mpv 获取音频电平数据，调用 detectFromSilence
2. **跳过 UI**：在播放器中显示"跳过片头"按钮
3. **更新服务端**：实现 checkUpdateFn 的真实 HTTP 调用
4. **下载器接入**：将 downloadFn 接入真实 HTTP 下载
5. **升级迁移**：为每个版本编写数据迁移函数并注册到 MigrationRegistry
6. **回滚机制**：在 Electron 中实现自动回滚（检测到启动崩溃时）

## 6. 提交记录

| SHA | 提交主题 | 已推送 |
|---|---|---|
| `待回填` | `feat(win-p4): intro/outro detection, update manager, release pipeline` | 是 |

## 7. 回滚策略

- 所有新模块均为纯新增文件
- `package.json` 的 build 链变更可通过移除 `check:phase4-release` 回滚
- 不影响 Phase 1/2/3 已有功能

## 8. 残余风险

1. **检测精度**：silence-based 检测可能误检，需要结合 blackframe/chapter 等方法
2. **更新安全性**：checksum 验证已实现，但需要 HTTPS + 证书锁定防止 MITM
3. **回滚数据兼容**：回滚后可能需要数据降级迁移，当前 MigrationRegistry 只支持升级迁移
