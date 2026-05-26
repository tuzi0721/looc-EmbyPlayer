# 通知中心 / Toast / 任务托盘 实施大纲

> 该文档用于在多轮对话或上下文被打断时，让接手的 AI / 维护者立刻知道目标、范围、当前进度与下一步要做什么。
> 仓库根：`a:/vsc/emby-player`

## 目标（What）

为 emby-player 增加一套统一的"通知能力"：

1. **应用内通知中心**：右侧抽屉，按类别分组（下载 / 线路 / 登录 / 系统），支持全部已读 / 单条删除 / 一键清空。
2. **Toast 提示**：右下角悬浮，根据级别自动消失（success/info 4s；warning 7s；error 默认常驻），点击 `action.kind = navigate` 跳转。
3. **OS 原生通知**：当窗口未聚焦时调用 `tauri-plugin-notification` 弹出系统通知。
4. **系统托盘**（Windows 优先）：常驻 tray icon，未读计数叠加在 tooltip / 图标徽标；菜单：显示 / 隐藏窗口、下载中心、设置、退出；点击图标切换窗口显示。
5. **接入源**：
   - DownloadEngine（`Completed` / `Failed` / `Cancelled` / `transient retry`）
   - HealthScheduler（自动切线、全部线路不可用）
   - 鉴权失效（`401` 之类）

## 不做（Out-of-Scope）

- 浏览器 Web Push / 第三方推送。
- 多设备同步通知（device-sync 已在后续单独大纲）。
- 富文本通知（仅 plain string + 可选 action）。

---

## 数据模型

### Rust（`src-tauri/src/notifications/types.rs`）

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind { Info, Success, Warning, Error }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationCategory { Download, Server, Auth, System }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    pub kind: String,             // "navigate" | "open-task" | "retry"
    pub label: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub kind: NotificationKind,
    pub category: NotificationCategory,
    pub title: String,
    pub body: Option<String>,
    pub action: Option<NotificationAction>,
    pub created_at: DateTime<Utc>,
    pub read: bool,
    pub sticky: bool,             // true → Toast 不自动消失
    pub source_id: Option<String>,// 关联的 download/server id 等
}
```

### TypeScript（`src/types/models.ts`）

```ts
export type NotificationKind = "info" | "success" | "warning" | "error";
export type NotificationCategory = "download" | "server" | "auth" | "system";
export interface NotificationAction {
  kind: "navigate" | "open-task" | "retry";
  label: string;
  payload?: unknown;
}
export interface Notification {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  action?: NotificationAction | null;
  createdAt: string;
  read: boolean;
  sticky: boolean;
  sourceId?: string | null;
}
```

---

## 后端模块结构

```
src-tauri/src/
├── notifications/
│   ├── mod.rs               // pub use
│   ├── types.rs             // 上述结构
│   ├── center.rs            // NotificationCenter（push/dismiss/clear/list/mark_read）
│   └── os_bridge.rs         // 触发 tauri-plugin-notification
├── tray/
│   └── mod.rs               // 系统托盘初始化、菜单、点击与未读联动
└── commands/
    └── notifications.rs     // tauri 命令：list/dismiss/clear/mark_all_read
```

### NotificationCenter API

- `push(spec: NotificationSpec) -> Notification`
  - 内部生成 `id = uuid::Uuid::new_v4()`、`created_at = Utc::now()`、`read = false`。
  - 写入 `parking_lot::RwLock<VecDeque<Notification>>`，最大 100 条，溢出从头丢弃。
  - 持久化到 `tauri-plugin-store` key = `notifications`。
  - 触发：
    - `app.emit("notification:new", &n)`
    - `app.emit("notification:unread", unread_count)`
    - 若窗口非前台且 `kind != info`：调用 `os_bridge::notify(&n)`。
- `list() -> Vec<Notification>`：按 `created_at` 倒序返回。
- `dismiss(id)`：移除一条，emit `notification:dismiss` + 更新 unread。
- `clear()`：emit `notification:cleared`，全部清空。
- `mark_all_read()`：将所有 `read = true`，emit `notification:unread = 0`。
- `unread() -> usize`。

### 接入点

| 触发方                                             | 触发条件          | 通知                                                                                  |
| ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `download::engine::run_task::update_status`     | Completed     | `Success / Download` "{title} 已下载完成" action: `open-task`                             |
| 同上                                              | Failed        | `Error / Download` "{title} 下载失败" body=error action: `retry`                         |
| 同上                                              | Cancelled     | `Info / Download` "{title} 已取消"                                                      |
| `download::engine::run_task` 进入 retry           | 连续 ≥3 次       | `Warning / Download` "{title} 网络重试中"                                                 |
| `network::health_scheduler::tick_once`          | 自动切线          | `Info / Server` "{server.name} 已切换到线路 {newLine.name}"                                |
| 同上                                              | 所有线路均不可用      | `Error / Server` "{server.name} 全部线路不可用" sticky=true                                 |
| `commands::auth` / `EmbyClient` 401              | 任意 401        | `Error / Auth` "{account} 登录已失效" action: `navigate` → `/login` sticky=true            |
| `mpv` 错误（loadfile fail 等）                       | 关键命令失败        | `Error / System` "播放失败" body=detail                                                  |

---

## 系统托盘（Windows 优先）

- 注册 tray 见 Tauri 2 文档：`tauri::tray::TrayIconBuilder`。
- 菜单：
  1. `显示 / 隐藏 主窗口`
  2. `下载中心 (n)` — n 为活动任务数（来自 `DownloadManager::list()` 过滤 Running/Paused）
  3. `通知中心 (m)` — m 为 unread
  4. `分隔符`
  5. `设置`
  6. `退出`
- Tooltip = `Emby Player | 下载 n · 未读 m`，每 5s 或事件触发刷新。
- 点击 icon：切换窗口 show/hide。
- 双击 icon：focus + 默认路由（home）。

> 顺序：托盘 icon **建议放后**，因为 Windows tray icon API + Tauri 2 还需要打 capabilities，先做中心 + Toast 更顺。

---

## tauri-plugin-notification 接入

`src-tauri/Cargo.toml`：

```toml
tauri-plugin-notification = "2"
```

`src-tauri/capabilities/default.json` 增加：

```json
"permissions": [
  "notification:default",
  "notification:allow-show"
]
```

`lib.rs` `Builder::default()` 末尾追加：

```rust
.plugin(tauri_plugin_notification::init())
```

`os_bridge`：

```rust
use tauri_plugin_notification::NotificationExt;
pub fn notify(app: &AppHandle, n: &Notification) -> AppResult<()> {
    app.notification()
        .builder()
        .title(&n.title)
        .body(n.body.clone().unwrap_or_default())
        .show()
        .map_err(|e| AppError::Other(e.to_string()))
}
```

---

## 前端模块结构

```
src/
├── stores/notifications.ts          // Pinia store
├── components/common/
│   ├── ToastStack.vue               // 右下角悬浮栈
│   └── NotificationCenter.vue       // 右侧抽屉
└── api/index.ts                     // 新增 list/dismiss/clear/markAllRead
```

### `stores/notifications.ts`

- `items: Notification[]`
- `unread: number`（衍生 computed）
- `centerOpen: bool`
- `pushLocal(n)`：本地仅 Toast，不持久化（极少情况下使用）
- `dismiss(id) / clear() / markAllRead()`
- `startListening()`：监听
  - `notification:new` → unshift
  - `notification:dismiss` → 删除
  - `notification:cleared` → 置空
  - `notification:unread` → 同步 unread

### `ToastStack.vue`

- 监听 store `items` 的 head；每次新条目入栈，根据 `kind` 决定停留时长：success/info 4s、warning 7s、error 不自动消（除非有 action 点击或手动 ×）。
- 最多同时显示 4 条，溢出走"+x 个通知"折叠条。
- 动画：右侧滑入；离开时上升淡出。

### `NotificationCenter.vue`

- 右侧抽屉，宽 360px，高度撑满。
- 头部：标题"通知中心" + 全部已读按钮 + 清空按钮。
- 类别 Tab：全部 / 下载 / 线路 / 登录 / 系统（Tab 实际过滤 store.items）。
- 列表项：图标（按 kind）+ 标题 + 描述 + 时间 + action 按钮 + 删除。

### `HomeView` 顶部右侧增加铃铛按钮 + 未读 badge

```vue
<button class="iconbtn" @click="notifications.toggleCenter">
  <Icon icon="lucide:bell" width="18" />
  <span v-if="notifications.unread > 0" class="badge">{{ notifications.unread }}</span>
</button>
```

### `App.vue` 全局挂载 `<ToastStack />`，并在 `onMounted` 中：

```ts
notifications.startListening();
await notifications.refresh();
```

---

## 实施顺序（建议）

> 与 todo list 一一对应，编号即 todo id。

1. `nc-1-backend-types`
2. `nc-2-backend-center`
3. `nc-3-backend-events`
4. `nc-4-backend-cmds`
5. `nc-14-fe-types`
6. `nc-15-fe-api`
7. `nc-10-fe-store`
8. `nc-11-fe-toast`
9. `nc-12-fe-center`
10. `nc-13-fe-nav`
11. `nc-7-hook-download`
12. `nc-8-hook-health`
13. `nc-9-hook-auth`
14. `nc-5-os-plugin`
15. `nc-6-tray`
16. `nc-16-final-feedback`（请求用户反馈）

每一步完成后用 `寸止` 确认是否继续，仅在用户明确通过 `寸止` 同意结束时才能结束本轮对话。

## 用户硬性规则（务必遵守）

- 只能通过 MCP `寸止` 询问用户。
- 不要生成测试脚本。
- 不要编译，由用户编译。
- 不要运行，由用户运行。
- `请记住：` 触发即调用 `记忆` add，`project_path = a:/vsc/emby-player`。

## 当前进度（同步自 IDE todo list）

实现尚未开始；上一轮任务（字幕模块）已完成。
