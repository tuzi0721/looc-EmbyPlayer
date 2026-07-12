# Phase 2：统一网络可靠性与播放恢复（交接文档）

> 状态：`accepted`  
> 创建日期：`2026-07-13`  
> 前置条件：Phase 1 安全基线已验收（commit `43c377b`）  

## 1. 目标

Phase 2 建立了统一网络内核、可取消请求链路、播放恢复状态机和 latest-wins 会话协调的纯逻辑基础，为后续集成人接入 `electron/main.mjs` 提供可测试的合约。

## 2. 变更文件清单

### 新增文件

| 文件 | 职责 |
|---|---|
| `electron/backend/network/errors.mjs` | 稳定错误码、分类、可重试性、NetworkError 类、classifyError |
| `electron/backend/network/redaction.mjs` | URL/Header/Event 脱敏 |
| `electron/backend/network/request-policy.mjs` | 超时/重试/幂等策略预设 |
| `electron/backend/network/retry.mjs` | 指数退避、抖动、Retry-After、abortableSleep |
| `electron/backend/network/response.mjs` | 安全 JSON/文本解析、大小限制 |
| `electron/backend/network/request.mjs` | 统一请求执行器（组合超时+取消+重试+解析） |
| `electron/backend/network/index.mjs` | 公共导出面 |
| `electron/backend/network/cancel-registry.mjs` | IPC 取消注册表（sender 隔离、TTL、大小上限） |
| `electron/backend/playback/recovery-machine.mjs` | 播放恢复状态机（纯逻辑） |
| `electron/backend/playback/session-coordinator.mjs` | latest-wins 会话协调器 |
| `scripts/check-network-policy.mjs` | N1 网络内核测试（10 项） |
| `scripts/check-playback-recovery.mjs` | P1/P3/N2 恢复+取消测试（20 项） |
| `docs/AI_HANDOFF/PHASE_2_2026-07-13_network-recovery.md` | 本文档 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `package.json` | 新增 `check:network-policy` 和 `check:playback-recovery` 门禁命令，接入 build 链 |

## 3. 架构设计

### 3.1 N1 统一网络内核

```
networkRequest(url, { policy, signal, ... })
  ├── singleAttempt()
  │     ├── fetch() with AbortSignal.any([local, external])
  │     ├── connect timeout → timeout_connect
  │     ├── response timeout → timeout_response (covers body read)
  │     └── response parsing → JSON/text/none
  ├── classifyError() → NetworkError(code, category, retryable)
  ├── decideRetry() → backoffDelay + Retry-After
  └── abortableSleep() between retries
```

**错误分类**（15 种稳定 code）：cancelled, timeout_connect/response/total, network_unreachable, connection_reset, tls, http_auth/not_found/rate_limit/transient/client, invalid_response, parse, unknown

**重试规则**：GET/HEAD 默认可重试；POST/PUT/DELETE 默认不重试；429/502/503/504 可重试（尊重 Retry-After）；401/403/404 不自动重试；取消不重试

### 3.2 P1 播放恢复状态机

```
idle → resolving → starting → playing
                                  ↓ (error)
                          recovering_re_resolve
                          recovering_reload
                          recovering_switch_source
                          recovering_software_decode
                          recovering_recreate
                                  ↓ (success)
                                playing
                                  ↓ (budget exhausted)
                                failed

Terminal: superseded, cancelled, failed, stopped
```

**恢复顺序**（由错误类别选择）：
1. URL 过期/401 → re_resolve
2. 网络错误 → re_resolve → switch_source → reload
3. 解码错误 → software_decode → recreate
4. 播放器崩溃 → recreate → reload
5. Stall → reload → re_resolve

**预算**：单动作 1-2 次，总动作 ≤4 次，冷却 10s

### 3.3 P3 latest-wins 会话协调

- 每个 intent 获得递增 generation
- 新 generation 立即 supersede 旧 generation
- 已 Started 的旧会话发送一次 Stopped
- 未 Started 的旧请求不发送虚假 Stopped
- 只有 current generation 可提交 session/启动播放器/上报 Playing

### 3.4 N2 IPC 取消注册表

- 按 requestId 注册 AbortController
- sender 隔离：不能跨窗口取消
- TTL 120s + 大小上限 500
- cancelAllForSender：窗口销毁时清理

## 4. 测试结果

| 门禁 | 结果 |
|---|---|
| check:secure-credentials | PASS |
| check:electron-security | PASS |
| check:network-policy | PASS (10/10) |
| check:playback-recovery | PASS (20/20) |
| check:local-decode | PASS (182 files) |
| check:no-planned-ui | PASS (97 files) |
| vue-tsc --noEmit | PASS |
| vite build | PASS (185 modules, 4.33s) |

## 5. 集成人待办（Phase 2B/2C）

以下文件尚未接入生产代码，需要集成人完成：

1. **Emby 适配**：将 `emby.mjs` 的 `requestJson()` 和 `probeRangeSupport()` 替换为 `networkRequest()`
2. **WebDAV/Alist 适配**：将 connector 的 fetch 调用替换为 `networkRequest()`
3. **IPC 取消接线**：在 `preload.cjs` 暴露 cancel 方法，在 `main.mjs` 注册 CancelRegistry
4. **会话协调器接入**：将 `main.mjs` 的 `currentPlaySession` 和 `playQueue` 替换为 `SessionCoordinator`
5. **恢复状态机接入**：将播放器错误事件接入 `RecoveryMachine`

## 6. 提交记录

| SHA | 提交主题 | 已推送 |
|---|---|---|
| `待回填` | `feat(win-p2): unified network kernel, recovery state machine, latest-wins coordinator` | 是 |

## 7. 回滚策略

- 所有新模块均为纯新增文件，不修改现有业务逻辑
- `package.json` 的 build 链变更可通过移除两个 check 命令回滚
- 回滚后不影响 Phase 1 安全基线

## 8. 残余风险

1. **未接入生产流量**：网络内核和状态机尚未替换现有 fetch 调用，实际错误分类和恢复行为需集成后验证
2. **未在真实 Windows Electron 构建上测试**：需要集成后执行 §13 的 smoke 测试
3. **AbortSignal.any() 兼容性**：需要 Node.js 20+ 或 Electron 30+
