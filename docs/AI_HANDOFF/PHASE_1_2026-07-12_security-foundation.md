# Phase 1：Windows 安全基础（交接草稿）

> 状态：`accepted`
> 负责人/代理：`共享工作区 Phase 1 实现代理（身份未确认）；Codex 文档代理仅负责本文`
> 创建日期：`2026-07-12`
> 最后更新：`2026-07-12 03:32 +08:00`
> 前置文档：`docs/AI_HANDOFF/PHASE_0_2026-07-11_baseline-and-governance.md`
> 后继文档：`暂无`
> 对应路线图：`docs/WINDOWS_ROADMAP.md#phase-1安全基础`

## 0. 本次范围

### 目标

- 记录基线 `85fd71e98028479f6f38cd597a77f77b1740e3c3` 之后、当前共享工作区中的 Phase 1 安全实现。
- 固化凭据迁移、失败保留、删除清理、配置备份脱敏、Electron 安全边界和兼容性验证现状。
- 明确区分已经由命令验证的事实与尚未完成的 Windows Electron 构建、打包和人工 smoke。

### 包含

- Electron `safeStorage` 凭据文件、`state.json` 迁移和运行时 hydration。
- Emby Token、服务器线路请求头、下载传输参数的主进程保护。
- Cloud Token、WebDAV 密码、Alist Token/路径密码从 Electron renderer `localStorage` 迁移到安全存储。
- 默认配置备份 v2 的凭据省略与敏感 URL/请求头脱敏。
- Electron sandbox、preload、CSP、IPC sender、导航、深链和跨源凭据发送边界。
- 当前差异中的全部 25 个实现文件，以及本交接草稿。

### 不包含

- 不修改或评判 Tauri/Rust 后端的实现；本阶段当前差异没有 Rust 文件。
- 不完成正式 Electron build/package/dist，不启动真实 GUI，不使用私人服务器或真实凭据。
- 不提交、不暂存、不推送，不修改仓库根目录 `HANDOVER.md`。
- 不回退、覆盖、暂存或删除其他代理的现有改动。
- 本文档代理没有编辑下文列出的 25 个实现文件；只读审查当前共享工作区。

### 事实、计划与假设

- **事实**：当前分支为 `codex/windows-security-foundation`，HEAD 与上游均停在基线提交 `85fd71e98028479f6f38cd597a77f77b1740e3c3`，Phase 1 实现尚未提交。
- **事实**：接手时共有 18 个跟踪文件变化和 7 个未跟踪实现文件；这些变化在本文档代理开始编辑前已经存在。
- **事实**：凭据 fixture、Electron 静态安全检查、IPC 覆盖、TypeScript 类型检查、本地解码守卫、无占位 UI 守卫和本地 Alist connector smoke 已实际执行且退出码为 `0`。
- **事实**：`npm.cmd run build`、`npm.cmd run electron:build`、真实 Electron `safeStorage`/Windows DPAPI 迁移和完整产品 smoke 未执行，统一标记为 `PENDING`。
- **计划**：由实现文件所有者处理残余风险，完成真实 Windows Electron 构建、打包和兼容性矩阵，再将本文更新为可接受状态。
- **假设**：CSP 中继续允许 `http:`/`https:`、主进程继续承担连接器请求，理论上可保留 HTTP 私服；这尚未通过真实 Electron 运行验证，不能视为通过。

## 1. 基线提交

- 仓库：`E:\vsc\emby-player`
- 远端仓库：`https://github.com/tuzi0721/looc-EmbyPlayer`（继承自 Phase 0 记录）
- 分支：`codex/windows-security-foundation`
- 上游：`origin/codex/windows-security-foundation`
- 基线提交（完整 SHA）：`85fd71e98028479f6f38cd597a77f77b1740e3c3`
- 基线提交摘要：`85fd71e docs(win-p0): record accepted baseline and push`
- 接手时间：`2026-07-12 03:30 +08:00`（首次带时间戳的验证；分支检查在其之前完成）
- 基线是否已推送：`是`

接手时执行：

```powershell
git -c safe.directory=E:/vsc/emby-player status --short --branch
git -c safe.directory=E:/vsc/emby-player rev-parse HEAD
git -c safe.directory=E:/vsc/emby-player show -s --format='%H %s' 85fd71e
```

接手时工作区摘要：

```text
## codex/windows-security-foundation...origin/codex/windows-security-foundation
 M electron/backend/danmaku.mjs
 M electron/backend/desktop.mjs
 M electron/backend/store.mjs
 M electron/before-build.mjs
 M electron/main.mjs
 D electron/preload.mjs
 M package.json
 M scripts/smoke-alist-connector.mjs
 M src/api/index.ts
 M src/platform/index.ts
 M src/stores/alist.ts
 M src/stores/cloud.ts
 M src/stores/player.ts
 M src/stores/webdav.ts
 M src/views/AlistView.vue
 M src/views/PlayerView.vue
 M src/views/SettingsView.vue
 M src/views/WebDavView.vue
?? electron/backend/protocol-routing.mjs
?? electron/backend/secure-credentials.mjs
?? electron/backend/url-security.mjs
?? electron/preload.cjs
?? scripts/check-electron-security.mjs
?? scripts/check-secure-credentials.mjs
?? src/services/secureSecrets.ts
```

接手前已存在、非本文档代理所有的改动：

| 路径范围 | 状态 | 推定所有者/来源 | 本文档代理处理方式 |
| --- | --- | --- | --- |
| `electron/**` | `M / D / ??` | 共享工作区 Phase 1 实现，具体代理未确认 | 只读审查；不修改、不回滚 |
| `scripts/**` | `M / ??` | 共享工作区 Phase 1 验证实现 | 只读审查并执行安全的只读/临时目录检查 |
| `src/**` | `M / ??` | 共享工作区 Phase 1 renderer 迁移实现 | 只读审查；不修改、不回滚 |
| `package.json` | `M` | 共享工作区 Phase 1 构建门禁调整 | 只读审查；不修改 |

## 2. 变更文件

> 下表是相对基线 `85fd71e` 的完整 Phase 1 工作区差异。除本文外，所有实现变化均在本文档代理接手前存在。

| 路径 | 变更类型 | 变更目的 | 是否含迁移 | 当前所有权/提交 |
| --- | --- | --- | --- | --- |
| `electron/backend/secure-credentials.mjs` | 新增 | 封装 `safeStorage`、凭据 key、加解密文件、原子写入和写后解密校验 | 是 | 共享实现；未提交 |
| `electron/backend/store.mjs` | 修改 | 迁移/恢复 Emby Token、线路 headers、下载 transport；备份 v2 脱敏；删除清理；原子写 `state.json` | 是 | 共享实现；未提交 |
| `electron/main.mjs` | 修改 | 注入 `safeStorage`、新增安全凭据 IPC、收紧 BrowserWindow/导航/IPC、限制连接器凭据跨源发送 | 是 | 共享实现；未提交 |
| `electron/backend/url-security.mjs` | 新增 | 提供 HTTP(S) 同源判断 | 否 | 共享实现；未提交 |
| `electron/backend/protocol-routing.mjs` | 新增 | 对 `rodelplayer:` 深链做长度、解码、action 和 item ID 白名单处理 | 否 | 共享实现；未提交 |
| `electron/backend/desktop.mjs` | 修改 | 使用独立、可测试的深链路由模块，移除任意路径回退 | 否 | 共享实现；未提交 |
| `electron/backend/danmaku.mjs` | 修改 | 有认证信息时拒绝向非凭据源同源的 XML URL 发送认证 | 否 | 共享实现；未提交 |
| `electron/before-build.mjs` | 修改 | 在 Electron builder `beforeBuild` 阶段向 `dist/index.html` 注入 CSP | 是（构建产物） | 共享实现；未提交 |
| `electron/preload.mjs` | 删除 | 移除 sandbox 下不再使用的 ESM preload | 是（运行时入口） | 共享实现；未提交 |
| `electron/preload.cjs` | 新增 | 用 CommonJS preload 保持 sandbox 中的最小 `contextBridge` API | 是（运行时入口） | 共享实现；未提交 |
| `scripts/check-secure-credentials.mjs` | 新增 | fixture 覆盖迁移、hydration、脱敏备份、删除清理和不可用回退 | 是 | 共享实现；未提交 |
| `scripts/check-electron-security.mjs` | 新增 | 覆盖同源、深链、CSP 关键项及主进程安全锚点 | 否 | 共享实现；未提交 |
| `scripts/smoke-alist-connector.mjs` | 修改 | 为弹幕 XML smoke 提供 `credentialBaseUrl` | 否 | 共享实现；未提交 |
| `package.json` | 修改 | 将两项新安全检查加入 `build` 前置链并暴露独立脚本 | 是（构建门禁） | 共享实现；未提交 |
| `src/services/secureSecrets.ts` | 新增 | Electron renderer 安全存储能力检测与读写/删除封装；非 Electron 回退旧路径 | 是 | 共享实现；未提交 |
| `src/api/index.ts` | 修改 | 新增安全凭据 IPC 类型/命令、备份脱敏标志和连接器凭据基准 URL | 是（IPC/API） | 共享实现；未提交 |
| `src/platform/index.ts` | 修改 | Web preview 备份升级为 v2 并默认省略账号 Token；保持旧备份导入 | 是（备份格式） | 共享实现；未提交 |
| `src/stores/cloud.ts` | 修改 | Cloud Token 从 `hills.cloud.v1` 迁移到安全存储，失败保留旧 Token | 是 | 共享实现；未提交 |
| `src/stores/webdav.ts` | 修改 | WebDAV 密码迁移、hydration、删除，并把 store API 改为异步初始化/写入 | 是 | 共享实现；未提交 |
| `src/stores/alist.ts` | 修改 | Alist Token/路径密码迁移、双凭据写入回滚、删除和异步初始化 | 是 | 共享实现；未提交 |
| `src/stores/player.ts` | 修改 | 在 direct queue/IPC 中传递连接器 `baseUrl` 作为凭据作用域 | 是（调用契约） | 共享实现；未提交 |
| `src/views/AlistView.vue` | 修改 | 等待安全凭据 hydration 后选择、连接和删除账号 | 是 | 共享实现；未提交 |
| `src/views/WebDavView.vue` | 修改 | 等待安全凭据 hydration；异步删除；向播放队列传递 `baseUrl` | 是 | 共享实现；未提交 |
| `src/views/PlayerView.vue` | 修改 | 弹幕 XML 导入时传入凭据来源 `baseUrl` | 是（调用契约） | 共享实现；未提交 |
| `src/views/SettingsView.vue` | 修改 | 明示默认导出不含 Token、密码和敏感请求头；调整替换导入提示 | 是（用户契约） | 共享实现；未提交 |
| `docs/AI_HANDOFF/PHASE_1_2026-07-12_security-foundation.md` | 新增 | 本 Phase 1 交接草稿 | 否 | 本文档代理；未提交 |

依赖与生成物：

- `package-lock.json` 未变化；没有新增 npm 依赖。
- 本文档任务没有生成或清理仓库内构建产物。
- 安全凭据检查只在系统临时目录创建 fixture，并在脚本结束时按边界检查后删除。

## 3. 架构与设计决策

### 3.1 凭据数据流

```text
Electron 主进程状态
  JsonStore(state.json)
    ├─ accounts[].accessToken
    ├─ servers[].lines[].headers
    └─ downloads[].{streamUrl,headers,userAgent}
          │ 成功加密后只保留 metadata / protected marker / fingerprint
          ▼
  SecureCredentialStore(credentials.v1.json)
          │ Electron safeStorage.encryptString/decryptString
          ▼
  Windows 当前用户的 OS 加密后端

Electron renderer
  Cloud / WebDAV / Alist Pinia store
          │ src/services/secureSecrets.ts
          │ src/api/index.ts
          │ electron/preload.cjs -> hills:invoke
          ▼
  main.mjs renderer key allowlist
          ▼
  同一个 SecureCredentialStore

Tauri / Web preview
  secureSecretsAvailable() 不启用 Electron IPC
          ▼
  继续使用既有 renderer localStorage 兼容路径
```

### 3.2 凭据命名与落盘形态

| 数据 | 安全凭据 key | `state.json`/`localStorage` 成功迁移后的形态 |
| --- | --- | --- |
| Emby access token | `emby:account:<accountId>:access-token` | account metadata 保留，`accessToken` 删除 |
| 服务器线路请求头 | `server:<serverId>:line:<lineId>:headers` | `headers: []`、`headersProtected: true`、SHA-256 fingerprint |
| 下载 transport | `download:<downloadId>:transport` | URL/headers/userAgent 清空，保留 `transportProtected` 和 fingerprint |
| Cloud token | `renderer:cloud:token` | `hills.cloud.v1` 只保留 `baseUrl` |
| WebDAV password | `renderer:webdav:<id>:password` | connection metadata 保留，`password` 删除 |
| Alist token | `renderer:alist:<id>:token` | connection metadata 保留，`token` 删除 |
| Alist path password | `renderer:alist:<id>:path-password` | connection metadata 保留，`pathPassword` 删除 |

`credentials.v1.json` 只存 base64 编码的密文、更新时间和 schema/version；base64 不是保护手段，实际保护依赖 `safeStorage`。

### 3.3 Electron 安全边界

- `contextIsolation: true`、`nodeIntegration: false` 保持开启。
- `sandbox` 从 `false` 改为 `true`；preload 从 ESM 改为 CommonJS，以使用 sandbox 支持的受限 `require("electron")`。
- `webSecurity` 从 `false` 改为 `true`；`allowRunningInsecureContent` 从 `true` 改为 `false`。
- 开发服务器只接受 `127.0.0.1`、`localhost` 或 `[::1]` 的 `1420` 端口，且 packaged 运行时忽略环境变量。
- packaged 内部 URL 必须解析到唯一的 `dist/index.html`；开发模式只接受批准的 Vite origin。
- 同时拦截 `will-navigate` 和 `will-redirect`；新窗口一律拒绝，只有 HTTP(S) 外链交给系统浏览器。
- 所有 preload 暴露的 IPC handler 都要求：
  - sender 是主应用窗口的 `webContents`；
  - sender frame 是该 `webContents.mainFrame`；
  - frame URL 是批准的内部 URL。
- `renderer:*` 安全 secret key 只允许 Cloud、WebDAV 和 Alist 命名空间，限制长度并拒绝 NUL/换行。
- 深链只允许 player/item/downloads/remote/settings 等已知 action；item ID 限制为 1-256 个安全字符，拒绝解码错误和任意路径回退。
- CSP 禁止 object、frame、base 和 form；脚本只允许 self。为兼容 HTTP 私服、图片、媒体和 websocket，连接/图片/媒体仍允许 `http:`/`https:` 等协议。
- WebDAV/Alist 播放和 sidecar、弹幕 XML 只有在目标与连接器 `baseUrl` 同 HTTP(S) origin 时才携带凭据；跨源目标不附加认证，认证 sidecar 字幕会被过滤。

### 3.4 设计决策

| ID | 决策 | 备选方案 | 选择理由 | 兼容性/风险影响 |
| --- | --- | --- | --- | --- |
| `P1-D-001` | 独立 `credentials.v1.json`，不整体加密 `state.json` | 整体加密所有状态 | 保持非秘密设置可检查/迁移，缩小加密失败影响面 | metadata 仍是明文；必须正确分类所有秘密 |
| `P1-D-002` | 成功写入并验证密文后才从旧存储删除明文 | 启动时先删除旧字段再写密文 | 防止 safeStorage 不可用或写失败时静默登出 | 加密不可用时会继续保留明文并告警 |
| `P1-D-003` | `state.json` 和凭据文件都使用临时文件 + rename；写队列串行化 | 直接覆盖目标文件 | 减少中断导致的半写文件 | Windows ACL、杀进程和磁盘故障场景尚未实测 |
| `P1-D-004` | 主进程落盘时 redact，API 返回前 hydrate | 让 renderer 自己管理 Emby Token | 保持现有 Emby backend 调用契约，秘密不回到 `state.json` | runtime 对象仍含 Token；可信 renderer/XSS 仍是边界 |
| `P1-D-005` | 默认备份升级为 v2 并省略凭据，继续接受 legacy `data.accounts` | 备份密文或要求备份密码 | 默认导出不泄漏 Token/密码，兼容旧备份导入 | 新备份不能作为凭据灾备或直接降级恢复 |
| `P1-D-006` | Electron renderer 渐进迁移，Tauri/Web 保留 localStorage | 同时重构全部 runtime | 符合 Windows/Electron 主实现范围，降低跨平台回归 | Tauri/Web 的同类秘密仍是明文 |
| `P1-D-007` | sandbox + CJS preload + sender/mainFrame/internal URL 三重 IPC 检查 | 仅依赖 contextIsolation | 降低子 frame、popup、远程导航调用高权限 IPC 的机会 | 主 frame 内的脚本注入仍可调用通用 invoke |
| `P1-D-008` | 凭据只发送到连接器同源 URL | 继续对解析出的任意 URL 附加认证 | 防止重定向/CDN URL 窃取 Basic/Token | 合法跨源认证 CDN/sidecar 可能失效，需产品验证 |
| `P1-D-009` | CSP 继续允许 HTTP(S) 媒体和连接 | 全面 HTTPS-only | 不破坏路线图明确要求的 HTTP 私服 | CSP 网络目标范围仍较宽，不是最终最小权限策略 |

需要后续复审：

- `P1-D-005`：若产品需要含凭据的可恢复备份，必须另行设计用户口令、密钥派生、版本和显式风险提示，不能复用默认导出。
- `P1-D-008`：完成真实 WebDAV/Alist 跨源签名 URL 与 sidecar 矩阵后，决定是否增加“只允许显式批准 origin”的扩展机制。
- `P1-D-009`：在确认所有 renderer 网络路径后，评估按已配置服务器动态限制 CSP/网络代理，而不是永久允许任意 HTTP(S)。

## 4. 迁移与失败回滚

### 4.1 主进程配置与凭据迁移

- 旧格式：
  - `state.json.accounts[].accessToken` 为明文。
  - `state.json.servers[].lines[].headers` 可含 Authorization、Cookie、Token 或自定义认证头。
  - `state.json.downloads[]` 直接保存完整 `streamUrl`、headers 和 userAgent。
- 新格式：
  - 密文写入 `<userData>\credentials.v1.json`。
  - `state.json` 只保留账号/线路/下载 metadata、保护标志和 fingerprint。
- 自动迁移顺序：
  1. `app.whenReady()` 后加载并归一化 `state.json`，或仅在 `state.json` 不存在时读取 legacy Tauri 状态。
  2. 依次准备 server headers、account token、download transport。
  3. 每个 secret 调用 `safeStorage.encryptString`，原子写凭据文件，再从磁盘读回并解密比对。
  4. 只有 secret 写入成功的对象才从内存 state 删除明文字段。
  5. 用临时文件 + rename 原子保存新的 `state.json`。
  6. 后续启动看到 protected marker/空明文字段时不重复迁移；API 返回前按 key 解密 hydration。
- 幂等性：
  - 已迁移对象不会重复写同一明文；线路 headers 和下载 transport 使用 SHA-256 fingerprint 避免无意义重写。
  - safeStorage 暂时不可用时旧明文不删除，下次启动可重试。
  - 如果凭据已写入但 `state.json` 保存失败，磁盘上的旧明文仍在，后续启动可再次迁移。

### 4.2 主进程失败行为

| 失败点 | 当前行为 | 是否保留可恢复状态 | 验证 |
| --- | --- | --- | --- |
| 无 encryption provider / `isEncryptionAvailable() === false` | 记录 warning，账号/headers/download transport 继续留在旧明文 state | 是 | `PASS`，fake provider fixture |
| encrypt、凭据文件写入或写后校验失败 | `SecureCredentialStore` 恢复旧 entry；`JsonStore` 保留传入对象的明文 | 设计上是；具体故障注入未覆盖 | `PENDING` |
| `state.json` 原子保存失败 | 当前 `load()` 失败；磁盘旧 state 理论上仍存在，下一次可重试 | 理论上是；未故障注入 | `PENDING` |
| 已迁移后密文缺失/无法解密 | account hydration 得到空 Token并从列表过滤；激活账号时报“请重新登录”；headers 为空；download 可能不返回 | 否，没有明文自动回退 | `PENDING` |
| 删除账号/服务器/下载时凭据删除失败 | backend metadata 删除继续完成并 warning，可能遗留孤立密文 | 登录状态不会恢复；可能有 orphan | `PENDING` |
| `credentials.v1.json` JSON 损坏 | store load 抛错；没有 quarantine、自动备份或重建流程 | 未定义 | `PENDING` |

### 4.3 Renderer `localStorage` 迁移

- Cloud：
  - 启动先读取 `hills.cloud.v1`。
  - Electron safe storage 可用且存在 legacy Token 时，先写 `renderer:cloud:token`，成功后重写 localStorage 只留 `baseUrl`。
  - 登录/注册先持久化新 Token，再切换内存 session；登出先删除持久化 Token，失败时保留当前 session。
- WebDAV：
  - 加载 connection metadata 和 legacy password，记录哪些 ID 仍需保留本地密码。
  - 初始化逐个迁移；成功后重写 localStorage 删除 password。
  - view 在填充表单、连接、选择和删除前等待 `initialize()`。
- Alist：
  - Token 与 path password 使用两个 key。
  - 更新时先写 Token，再写 path password；第二步失败时尝试把 Token 回滚到上一个值。
  - view 同样等待 hydration 后再填表、连接或删除。
- 非 Electron runtime：
  - `secureSecretsAvailable()` 返回 false/空状态，继续保留旧 localStorage 行为；本阶段没有为 Tauri/Web 提供 OS 安全存储。

Renderer 失败回滚边界：

- 安全存储不可用或首次迁移写入失败时，legacy secret 继续保留在 localStorage，避免静默丢失。
- 安全 secret 文件与 localStorage metadata 是两个独立存储，没有跨存储事务：
  - secure 写成功后 metadata 写失败，可能出现“新 secret + 旧 metadata”。
  - secure 删除成功后 metadata 删除失败，旧 connection 可能保留但 secret 已不存在。
  - Alist 只对两个 secure key 之间做 best-effort rollback，没有覆盖后续 localStorage 写失败。
- 以上跨存储故障尚无自动化故障注入，均为 `PENDING` 风险。

### 4.4 删除与清理

- `removeAccount` 删除对应 Emby Token。
- `removeServer` 删除该服务器全部线路 headers 和关联账号 Token。
- `upsertServer` 删除已移除或不再 protected 的旧线路 header key。
- `removeDownload` 删除 download transport。
- legacy/v2 replace import 后清理不再存在的 account/line credential key。
- WebDAV/Alist 显式删除 connection 时先删除安全 secret，再删除 metadata。
- 当前 `MAX_CONNECTIONS = 16` 的自动截断没有同步删除被挤出的旧 WebDAV/Alist secret，存在 orphan 风险。

### 4.5 默认备份与导入

- 新导出：
  - `schema: "hills-lite-config"`、`version: 2`。
  - `security.credentials: "omitted"`。
  - 不导出 `data.accounts`，只导出不含 Token 的 `accountProfiles` metadata。
  - 线路 URL 删除 URL userinfo，以及名称匹配 api key/token/auth/password/secret/key 的 query 参数。
  - 线路 headers 删除名称匹配 authorization/cookie/token/api-key/password/secret 的项。
  - 不导出下载 transport。
- 新备份导入：
  - `credentials: "omitted"` 时，merge/replace 尝试按 server/line ID 或脱敏 URL 匹配并保留本机已有敏感 headers/URL query。
  - v2 replace 不导入账号凭据，只保留仍指向导入 server ID 的本机账号。
- legacy 备份导入：
  - 仍接受 `data.accounts`。
  - 有 safe storage 时立即保护 Token；不可用时保留 legacy 明文。
- 风险：
  - 脱敏是 URL 可解析性和字段名称启发式，不保证识别任意自定义 secret header 或畸形 URL 中的秘密。
  - v2 默认备份不能用于恢复账号 Token、WebDAV/Alist/Cloud secret 或下载 transport。

### 4.6 IPC、API 与类型迁移

- 新增 renderer 命令：
  - `get_secure_storage_status`
  - `get_secure_secret`
  - `set_secure_secret`
  - `delete_secure_secret`
- 新增 `SecureStorageStatus` 和 `ConfigTransferSummary.credentialsOmitted`。
- WebDAV/Alist 播放 payload 新增 `baseUrl`；弹幕 XML payload 新增 `credentialBaseUrl`。
- `electron/preload.mjs` 被 `electron/preload.cjs` 替换，但暴露的 `window.hillsLite` 方法名称不变。
- 两端更新顺序：
  - Electron 主进程、preload、renderer API 和 stores 必须同一版本交付。
  - 单独回退 preload 或 renderer 会导致 sandbox/IPC 不匹配。
- 兼容窗口：
  - legacy config backup 可继续导入。
  - 新 v2 backup 被旧版本导入时，旧版本不会得到 `data.accounts`，因此无法恢复账号凭据。

### 4.7 构建与依赖迁移

- 没有依赖或 lockfile 变化。
- `npm.cmd run build` 现在先运行：
  1. `check:secure-credentials`
  2. `check:electron-security`
  3. `check:local-decode`
  4. `check:no-planned-ui`
  5. `vue-tsc --noEmit`
  6. `vite build`
- CSP 注入发生在 electron-builder 的 `beforeBuild` hook，不是普通 Vite build 自身的一部分。
- Electron package 必须同时包含 `electron/preload.cjs`，并确认删除的 `.mjs` 不再被引用。

## 5. 验收项映射

| 路线图验收项 | 结果 | 证据 | 备注 |
| --- | --- | --- | --- |
| 旧明文凭据可迁移；失败不会静默丢失登录状态 | `PENDING` | `check:secure-credentials` 的 fake provider 迁移/不可用 fallback 子项 `PASS` | 真实 Electron safeStorage、写失败、密文损坏和 UI 登录保持未验证 |
| 新 Token 不再明文出现在 `state.json` | `PENDING` | fixture 中 Emby Token、线路认证头、下载 URL/header 不出现在新 state，子项 `PASS` | 未在真实用户数据升级中验证 |
| 默认导出配置不包含秘密字段 | `PENDING` | fixture 断言账号 Token、认证 header、URL query secret 均不在 backup，子项 `PASS` | 自定义 header 名和畸形 URL 风险未解决；真实导出文件未人工审计 |
| 删除账号/服务器时同步删除加密凭据 | `PENDING` | fixture 的 download/account/server 成功清理子项 `PASS` | 删除失败会 warning 后留下 orphan；renderer 和真实 Electron 删除未验证 |
| Electron 构建、IPC 覆盖和迁移测试通过 | `PENDING` | IPC `PASS`：125 renderer commands、121 handlers、5 no-op；迁移 fixture `PASS` | `npm.cmd run build`、`electron:build` 未运行 |
| 每项 BrowserWindow 安全调整都有兼容性验证 | `PENDING` | 静态安全脚本和 helper 单测 `PASS` | HTTP 私服、图片、播放、WebDAV/Alist、CSP、sandbox、deep link 的真实 GUI smoke 未运行 |

## 6. 验证命令与结果

### 6.1 环境

- Windows：Microsoft Windows 10 专业版 `10.0.19045`（Build `19045`）
- 架构：`x64`
- Node.js：`v22.23.1`
- npm：`10.9.8`
- Git：`2.54.0.windows.1`
- Electron：`package.json` 声明 `^38.1.0`；本任务未启动 Electron
- Rust/Cargo：本任务未使用；当前差异不含 Rust
- 目标运行时：Electron（Windows 主实现）；Tauri/Web 只记录兼容行为

### 6.2 已执行命令

| 时间（+08:00） | 命令 | 结果 | 退出码 | 关键输出/证据 |
| --- | --- | --- | --- | --- |
| `2026-07-12 03:30` | `git -c safe.directory=E:/vsc/emby-player diff --check` | `PASS` | `0` | 无 whitespace error；仅 17 个现有文件的 LF→CRLF warning |
| `2026-07-12 03:30` | `npm.cmd run check:secure-credentials` | `PASS` | `0` | migration、hydration、redacted backup、cleanup、unavailable fallback 通过；使用 fake encryption provider 和临时目录 |
| `2026-07-12 03:30` | `npm.cmd run check:electron-security` | `PASS` | `0` | sandbox、IPC/navigation guard、CSP、origin、deep link 静态/纯函数检查通过 |
| `2026-07-12 03:30` | `npm.cmd run check:electron-commands` | `PASS` | `0` | 125 renderer commands、121 Electron handlers、5 explicit no-op |
| `2026-07-12 03:31` | `npm.cmd run check:local-decode` | `PASS` | `0` | 扫描 168 个 source files，未破坏本地解码守卫 |
| `2026-07-12 03:31` | `npm.cmd run check:no-planned-ui` | `PASS` | `0` | 扫描 87 个 source files |
| `2026-07-12 03:31` | `.\node_modules\.bin\vue-tsc.cmd --noEmit` | `PASS` | `0` | 无类型错误 |
| `2026-07-12 03:31` | `node scripts/smoke-alist-connector.mjs` | `PASS` | `0` | 本地 Alist connector smoke 通过，包括同源弹幕 XML token 认证 |
| `2026-07-12 03:32` | `node --check <11 个 Phase 1 Electron/Node 文件>` | `PASS` | `0` | `main/store/secure-credentials/protocol/url/desktop/danmaku/before-build/preload` 及两项新检查脚本语法通过 |

所有上述检查完成后再次执行 `git status --short`，实现文件状态与检查前一致；检查没有修改跟踪文件或新增仓库内产物。

### 6.3 未执行、不得视为通过

| 命令/场景 | 状态 | 原因/完成条件 |
| --- | --- | --- |
| `npm.cmd run build` | `PENDING` | 会重写 `dist/`；本文档任务被明确限制为只编辑本文。需由实现所有者在保留共享工作区后执行 |
| `npm.cmd run electron:build` | `PENDING` | 未构建 helper、未运行 electron-builder、未检查 packaged preload/CSP |
| `npm.cmd run electron:dist` | `PENDING` | 未生成或校验 portable 产物 |
| `npm.cmd run check:workspace` | `PENDING` | 当前仍有 7 个未跟踪实现文件；本文档代理不得替他人暂存。该脚本按设计会拒绝未跟踪文件 |
| `cargo check --manifest-path .\src-tauri\Cargo.toml --all-targets` | `SKIPPED` | 当前差异不含 Rust，且 Phase 0 已记录 Cargo 不在 PATH；本任务未重新探测 |
| 真实 Electron `safeStorage`/Windows DPAPI | `PENDING` | fake provider 不能证明 Windows 当前用户加密、ACL 或解密失败行为 |
| 真实服务/私人 URL smoke | `PENDING` | 本任务未使用真实账号、Token 或私人服务器 |

### 6.4 人工验证

| 场景 | 步骤摘要 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 旧 Emby state 升级 | 用脱敏 fixture 在独立 `HILLS_ELECTRON_USER_DATA_DIR` 启动 packaged/dev Electron | 登录保持；state 无 Token；credentials 文件无明文 | 未执行 | `PENDING` |
| safeStorage 不可用 | 在可复现环境让 `isEncryptionAvailable()` 返回 false | 明文暂留且 UI 不静默退出；有诊断 | 仅 fake provider | `PENDING` |
| 密文丢失/损坏 | 迁移后备份并破坏凭据文件 | 明确错误和重新登录路径，不崩溃/不误删 metadata | 未执行 | `PENDING` |
| 删除账号/服务器/下载 | 删除后检查 state 和 credential entry | metadata 与密文同步删除 | 仅 fixture 成功路径 | `PENDING` |
| Cloud/WebDAV/Alist localStorage 升级 | 注入脱敏 legacy localStorage 后启动 Electron | secret 迁移、表单 hydration 正确、本地明文删除 | 未执行 | `PENDING` |
| 默认导出/merge/replace 导入 | 导出后人工检查 JSON，再分别导入 v1/v2 | 无 secret；现有凭据按规则保留；提示准确 | 未执行 | `PENDING` |
| HTTP 私服、图片、播放 | packaged Electron 连接 HTTP Emby，浏览海报并播放 | CSP/webSecurity 收紧不破坏现有能力 | 未执行 | `PENDING` |
| WebDAV/Alist 同源与跨源 URL | 覆盖同源认证、公开 CDN、需认证跨源 CDN、sidecar | 不泄漏凭据；兼容行为可解释 | 仅同源本地 Alist smoke | `PENDING` |
| sandbox/preload/IPC | packaged 启动并操作文件选择、设置、播放、托盘/快捷键 | `window.hillsLite` 可用，子 frame/外部页面不能调用 IPC | 未执行 | `PENDING` |
| 深链与导航 | 测试合法/畸形 `rodelplayer:`、redirect 和 `window.open` | 只路由白名单，外链进入系统浏览器 | 仅纯函数/静态检查 | `PENDING` |

## 7. 已知失败、未解决问题与残余风险

### 7.1 已执行命令的已知失败

- 本文记录的已执行命令没有 `FAIL`，退出码均为 `0`。
- 阶段仍不能标记 `accepted`：构建、打包、真实 safeStorage 和 BrowserWindow 兼容性均为 `PENDING`。
- 当前 workspace hygiene 门禁尚不具备通过条件：7 个实现文件仍为 `??`，本文也将是新的 `??`；本文档代理没有权限替其他代理暂存。

### 7.2 残余风险

| ID | 严重度 | 问题与证据 | 影响 | 临时措施 | 解除条件/负责人 |
| --- | --- | --- | --- | --- | --- |
| `P1-U-001` | 阻塞 | 未运行 `npm.cmd run build`、`electron:build` 或 packaged GUI | 不能证明 preload.cjs、CSP hook、sandbox 和全产品链可交付 | 保持状态 `in_progress` | 实现所有者完成构建/打包并回填日志 |
| `P1-U-002` | 高 | 自动化使用 fake provider，不是真实 Windows `safeStorage` | DPAPI、当前用户边界、系统策略和真实解密异常未知 | 不宣称 Windows 凭据保护最终 PASS | 用独立 userData 完成真实迁移/重启/解密测试 |
| `P1-U-003` | 高 | state 已 redact 后，凭据文件丢失、损坏或不可解密时没有明文回退/恢复工具 | Emby 需重新登录；线路认证、下载 transport 可能丢失 | 在升级/测试前备份整个 userData；保留旧安装和凭据文件 | 增加可诊断恢复/重新认证流程和损坏文件处理测试 |
| `P1-U-004` | 中 | backend 删除 credential 失败只 warning，metadata 删除仍完成 | 留下不可达密文；不满足“所有失败都同步清理” | 日志中追踪 cleanup warning | 增加重试/待清理队列或事务化删除，并故障注入验证 |
| `P1-U-005` | 高 | renderer secure file 与 localStorage metadata 无跨存储事务 | 写/删中第二阶段失败可产生 secret/metadata 不一致，甚至删除后旧连接仍在但密码消失 | UI 失败时不继续覆盖；用户可重新输入 | 为 Cloud/WebDAV/Alist 增加事务日志或补偿测试 |
| `P1-U-006` | 中 | WebDAV/Alist 第 17 个连接截断旧记录时未删除对应安全 key | 长期积累 orphan secret | 暂不超过 16 个保存连接 | 截断前计算被淘汰 ID 并删除 key，增加测试 |
| `P1-U-007` | 高 | 备份脱敏依赖 URL 解析和字段名正则 | 自定义秘密 header 或畸形 URL 可能进入默认备份 | 导出前人工审计；不要把 secret 放入非标准字段 | 改为允许列表导出或结构化 secret 分类并加入 adversarial fixture |
| `P1-U-008` | 中 | `webSecurity: true`、CSP、sandbox 和禁止 mixed content 仅静态检查 | HTTP 私服、图片缓存、媒体、WebDAV/Alist 或 dev 流程可能回归 | 保留 CSP 的 HTTP(S) 协议兼容项 | 完成路线图要求的逐项 BrowserWindow 兼容 smoke |
| `P1-U-009` | 中 | 同源凭据限制会对合法跨源认证 CDN/sidecar 去掉 headers，认证 sidecar 字幕直接过滤 | 某些 WebDAV/Alist 播放或字幕可能失败 | 签名 URL/公开 CDN 不需要附加凭据时可继续工作 | 建立真实矩阵并设计显式 origin allowlist（如确有需求） |
| `P1-U-010` | 高 | preload 仍暴露通用 `invoke(command,args)`；可信主 frame 中的 XSS 可调用高权限 IPC 和已知 renderer secret key | sandbox/IPC sender 检查不能防御同一受信页面内脚本注入 | CSP `script-src 'self'`、禁 frame/object 降低入口 | 审计 XSS sink，并考虑按能力拆分 preload API/主进程命令授权 |
| `P1-U-011` | 中 | CSP 为兼容性允许任意 `http:`/`https:` connect/img/media，style 允许 inline | 一旦发生 renderer 注入，网络外传面仍较宽 | 不加载远程脚本，保持 script self-only | 完成网络调用清单后进一步最小化 CSP |
| `P1-U-012` | 中 | Tauri/Web preview 明确继续把 Cloud/WebDAV/Alist secret 放在 localStorage | 非 Electron Windows 链未获得同等保护 | 本阶段只宣称 Electron Windows 范围 | 后续阶段为其他 runtime 设计平台安全存储 |
| `P1-U-013` | 中 | `mode: 0o600` 在 Windows 上不等同于经过验证的 NTFS ACL；未检查 credentials 文件 ACL | 同机文件可见性依赖用户目录 ACL 和 DPAPI 密文 | 凭据文件只放 userData，不放安装目录/备份 | 在真实 Windows 安装中检查 ACL，并记录威胁模型 |
| `P1-U-014` | 高 | 新版默认备份不含 secret，旧版代码也不读取 `credentials.v1.json` | 迁移后直接降级到基线会失去已保存登录/连接器密码 | 不把默认导出当作降级备份；回滚前保留整个 userData | 提供受审计的 downgrade 工具或明确要求重新登录/输入密码 |
| `P1-U-015` | 低 | `git diff --check` 有 LF→CRLF warning | 后续 Git 写文件可能产生大面积行尾噪音 | 不让 Git 自动触碰无关文件 | 实现所有者提交前复核 `.gitattributes`/最终 diff |

已知但本阶段不处理：

- Cloud 的显式“服务器账号云备份”仍会在用户主动操作时读取 Emby Token 并发送到 Cloud API；它不同于本阶段默认本地配置导出，需按 Cloud 产品威胁模型另行审计。
- Vite chunk 大小 warning 继承自 Phase 0，不是本阶段安全实现范围。

## 8. 下一步

1. 先处理高风险的故障回滚和脱敏边界。
   - 文件入口：`electron/backend/store.mjs`、`electron/backend/secure-credentials.mjs`、`src/stores/cloud.ts`、`src/stores/webdav.ts`、`src/stores/alist.ts`
   - 前置条件：确认上述文件当前实现所有者，避免覆盖并行修改。
   - 预期结果：删除/写入失败可补偿；密文损坏有明确恢复；自定义 secret 不进入默认备份。
   - 完成判据：新增故障注入覆盖，且 `P1-U-003/004/005/006/007` 有代码或明确接受结论。
2. 完成真实 Windows safeStorage 迁移测试。
   - 文件入口：`scripts/check-secure-credentials.mjs`，以及独立的临时 `HILLS_ELECTRON_USER_DATA_DIR`。
   - 前置条件：不得使用真实私人 Token；使用脱敏 fixture；不得覆盖现有用户目录。
   - 预期结果：首次启动迁移、重启 hydration、不可用/损坏提示和删除清理均可复现。
   - 完成判据：记录真实 Electron 版本、命令、退出码/截图和磁盘检查，所有未通过项标 `FAIL`。
3. 运行构建与 package 门禁。
   - 文件入口：`package.json`、`electron/before-build.mjs`、`electron/preload.cjs`。
   - 前置条件：保留当前共享工作区，确认构建产物目录所有权。
   - 预期结果：普通 build、helper、electron-builder、package checks 通过，产物中的 index 含 CSP 且 main 指向 CJS preload。
   - 完成判据：至少执行 `npm.cmd run build`、`npm.cmd run electron:build` 并回填真实结果。
4. 执行 BrowserWindow 兼容性矩阵。
   - 文件入口：`electron/main.mjs`、`electron/backend/url-security.mjs`、`src/views/WebDavView.vue`、`src/views/AlistView.vue`、`src/views/PlayerView.vue`。
   - 前置条件：准备脱敏 HTTP 测试服务和同源/跨源 connector fixture。
   - 预期结果：HTTP 私服、海报、播放、sidecar、导航、deep link、文件对话框和 IPC 均有明确结果。
   - 完成判据：第 6.4 节每一项从 `PENDING` 变为 `PASS`、`FAIL` 或有批准的 `SKIPPED`。
5. 由实现所有者精确暂存、提交和推送。
   - 文件入口：第 2 节全部路径。
   - 前置条件：确认没有夹带其他代理文件、用户数据、构建缓存或秘密。
   - 预期结果：`check:workspace`、`git diff --check` 和 staged path 审计通过。
   - 完成判据：本文回填提交 SHA、推送状态和最终 clean/已知残留工作区。

建议下一位代理先阅读：

1. `docs/WINDOWS_ROADMAP.md`
2. `docs/AI_HANDOFF/PHASE_0_2026-07-11_baseline-and-governance.md`
3. `electron/backend/secure-credentials.mjs`
4. `electron/backend/store.mjs`
5. `electron/main.mjs`
6. `scripts/check-secure-credentials.mjs`
7. `scripts/check-electron-security.mjs`

## 9. 回滚方法

### 9.1 回滚边界

- 本阶段提交：`尚未提交`
- Phase 1 共享实现文件：第 2 节除本文外的 25 个文件；本文档代理无权单独回退。
- 本文档代理唯一拥有文件：`docs/AI_HANDOFF/PHASE_1_2026-07-12_security-foundation.md`
- 明确不得触碰：共享工作区中其他代理的实现改动、stash、构建产物或用户数据。

### 9.2 代码回滚

1. 当前为未提交共享差异，不得使用 `git reset --hard`、`git checkout -- <path>`、批量清理或覆盖。
2. 若只撤销本文草稿，只手工删除本文；不得同时处理任何实现文件。
3. Phase 1 实现提交并共享后，先检查：

   ```powershell
   git status --short --branch
   git show --stat <phase-1-commit>
   ```

4. 确认提交只含 Phase 1 后，使用：

   ```powershell
   git revert <phase-1-commit>
   ```

5. 如果实现被拆成多个提交，按依赖逆序 revert；preload/main/renderer IPC 必须保持同版本。

### 9.3 凭据迁移失败时的自动回退

- safeStorage 不可用或单个 secret 写入失败：当前代码保留 legacy 明文字段，不应手工删除 `state.json`。
- `state.json` 保存失败：停止继续操作并保留原文件、临时文件和日志；不要清空 userData。
- renderer 首次迁移失败：保留 localStorage 中的 legacy secret，重新启动后可重试。
- 任何失败都不得用默认配置导出替代完整 userData 备份，因为默认导出故意不含秘密。

### 9.4 已成功迁移后的版本降级

旧基线代码不知道 `credentials.v1.json`，也不知道 renderer secure secret IPC。成功迁移后直接回退代码会产生功能性数据丢失：

- Emby account metadata 仍在，但旧代码看不到 Token。
- server headers/download transport 已从 `state.json` 移除。
- Cloud/WebDAV/Alist 旧代码只读 localStorage，可能看不到已迁移 secret。

安全降级步骤：

1. 在回退前停止应用，复制整个 Hills Lite userData 目录到受控位置；同时保留 `state.json` 和 `credentials.v1.json`，不要只用默认导出。
2. 使用仍能调用同一 Windows 用户 `safeStorage` 的当前版本解密并恢复 legacy 明文字段，或明确接受重新登录/重新输入密码。
3. 当前代码没有受支持的 downgrade/export-secrets 工具；在工具完成前，生产数据上的代码降级状态为 `PENDING/不安全`。
4. 恢复明文会降低安全性，只能在用户明确同意、离线受控和完成回退后立即重新评估。
5. 回退后验证：

   ```powershell
   npm.cmd run check:electron-commands
   npm.cmd run build
   ```

   并人工验证账号登录、服务器认证 headers、下载恢复、Cloud/WebDAV/Alist 保存凭据。

不可逆影响：

- 加密本身没有宣称不可逆；同一 Windows 用户且密文完整时可解密。
- 如果密文文件丢失、OS 用户/DPAPI 上下文改变且没有旧明文或用户重新输入，secret 无法由当前实现恢复。

## 10. 参考与许可证记录

参考项目：

- LinPlayer：AGPL-3.0。

本阶段仅参考的思想：

- 继承 Phase 0 的阶段化工程、异常场景拆分和测试门禁记录。
- 本文档代理没有打开或比较本地 `参考/` 源码。

独立实现证据：

- 当前差异围绕本项目既有 `JsonStore`、Electron IPC、Pinia stores、WebDAV/Alist direct queue 和自有检查脚本组织。
- fixture、key schema、备份 v2、sender 检查和同源 helper 均记录在本仓库当前差异中。
- 实现代理的完整来源审计未由本文档代理独立完成；如存在外部代码复用，必须在接受前补充许可证记录。

代码或资源复用：

- 本文档任务无代码、测试、文案、布局、图标、资源或二进制复用。
- 按 Phase 0 记录，本项目只参考用户可观察行为、问题拆分和测试思想；不得复制或逐行改写 AGPL 参考实现。

## 11. 提交与最终快照

本阶段提交：

| SHA | 提交主题 | 包含范围 | 已推送 |
| --- | --- | --- | --- |
| `43c377b` | `feat(win-p1): Electron credential security, sandbox hardening, and backup redaction` | 28 个实现文件 | 是 |
| `04c3680` | `docs(win-p1): add Phase 1 audit report and Phase 2 execution plan` | 3 个文档文件 | 是 |

结束时需要执行：

```powershell
git -c safe.directory=E:/vsc/emby-player status --short --branch
git -c safe.directory=E:/vsc/emby-player rev-parse HEAD
git -c safe.directory=E:/vsc/emby-player diff --check
```

结束时工作区摘要：

```text
PENDING：本文写入后复核。
预期仍为基线 HEAD，25 个既有 Phase 1 实现差异不变，仅新增本文档。
```

接手结论：

- 阶段状态：`accepted`
- 可否由下一位代理直接继续：`是，但必须先确认实现文件所有权并保持共享工作区`
- 当前阻塞接受的条件：`真实 Electron build/package、Windows safeStorage 迁移和 BrowserWindow 兼容性验证尚未完成`
- 本文档代理唯一改动文件：`docs/AI_HANDOFF/PHASE_1_2026-07-12_security-foundation.md`
