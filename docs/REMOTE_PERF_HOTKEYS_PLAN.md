# 三项后续功能 实施大纲

> 仓库根：`a:/vsc/emby-player`
> 与 `docs/NOTIFICATION_CENTER_PLAN.md` 同样，本文档让中途接手的 AI 直接续上。

涉及三项独立但平行的功能：

1. **远程控制 / 同步播放** (`rc-*`)
2. **性能优化**（虚拟列表 / 海报懒加载）(`perf-*`)
3. **快捷键 / 全局热键** (`key-*`)

---

## 1. 远程控制 / 同步播放

### 目标

- 让本客户端可以被 **其他 Emby/Jellyfin 客户端** 通过 Sessions API 控制（Play / Pause / Stop / Seek / SetVolume）。
- 允许本客户端 **远程控制其他登录到同一服务器的客户端**（仿官方移动端可在网页上"播到电视"）。

### 后端

#### `EmbySocket` 增强

文件：`src-tauri/src/emby/socket.rs`

- 连接成功后 emit `Sessions/Capabilities/Full`，声明本端：
  - `PlayableMediaTypes`: `["Video", "Audio"]`
  - `SupportedCommands`: `["Play", "Pause", "Unpause", "Stop", "Seek", "ToggleMute", "SetVolume", "VolumeUp", "VolumeDown"]`
  - `SupportsMediaControl`: true
  - `SupportsPersistentIdentifier`: true
  - `DeviceProfile`: 一个最小化的 mpv profile（先用 emby 推荐的默认）。
- 在 `run()` 的 message loop 中识别这些消息并 emit 到 `controller`：
  - `Playstate` (PlayPause / Pause / Unpause / Stop / NextTrack / Seek / Rewind / FastForward)
  - `GeneralCommand` (DisplayMessage / ToggleMute / SetVolume / VolumeUp / VolumeDown / SetSubtitleStreamIndex / SetAudioStreamIndex)
  - `Play` (开新条目，会附带 `ItemIds` + `StartIndex` + `StartPositionTicks`)

#### `SessionController`

文件：`src-tauri/src/emby/session_controller.rs`（新）

- 持有 `Arc<MpvManager>` + `ConfigStore`。
- 入口：`handle(msg: SocketEvent) -> AppResult<()>`，分支处理上述消息。
- `Play` 消息要决定使用哪个 `MediaSource`、line、token，然后构造 `MpvCommand::Load`（参考 `commands::player::play`）。
- 在 `state.rs` 中创建并注册 `SessionController`；由 `socket.rs` 通过 `mpsc` 把消息推给 controller。
- `Stop` 时调用 `commands::player::stop` 路径，确保 `playback_stopped` 也上报。

#### 控制其他会话

新增 `EmbyClient::list_sessions(server, account)` 调 `Sessions` endpoint：
- 过滤掉本端 (`DeviceId == DEVICE_ID`)
- 返回精简 `RemoteSession { id, deviceName, userName, nowPlaying }`

新增 `EmbyClient::send_session_command(server, account, sessionId, command)`：
- 命令类型 `PlayPause / Pause / Stop / Seek / SetVolume / SendMessage`
- POST `Sessions/{sessionId}/Playing/PlayPause` 等

#### Tauri 指令

文件：`src-tauri/src/commands/remote.rs`（新）

- `list_sessions() -> Vec<RemoteSession>`
- `remote_play_pause(sessionId)`
- `remote_pause(sessionId)`
- `remote_unpause(sessionId)`
- `remote_stop(sessionId)`
- `remote_seek(sessionId, positionMs)`
- `remote_set_volume(sessionId, volume)`
- `remote_play(sessionId, itemId)` （让对方播放某项）

### 前端

#### 类型与 API

- `types/models.ts`：`RemoteSession`、`RemoteSessionNowPlaying`
- `api/index.ts`：上述命令的包装

#### UI

- `views/RemoteControlView.vue`：左侧列出在线会话，右侧大型遥控（播放暂停、上一首、下一首、音量、进度条、状态显示）。
- 入口：HomeView 顶部增加 `lucide:cast` 按钮 → `/remote`。
- `stores/remote.ts`：Pinia store；轮询 `list_sessions`（5s）、推送 `nav:goto`/事件刷新。
- 当前是否被控制：通过 `socket` 上 emit 的 `controller:active` 事件控制 UI 提示（Now playing 模式）。

### 设置

- `AppSettings.remote_control_enabled: bool`（默认 true）。`false` 时不向 socket 发送 capabilities，等同于不接受被控制。

---

## 2. 性能优化（虚拟列表 / 海报懒加载）

### 目标

- 海量库（数千条 item）滚动也不卡。
- 海报图只在视口附近时才加载。
- 首屏内容能尽早呈现（骨架 → 真实数据）。

### 海报懒加载

- 修改 `src/components/common/PosterCard.vue`：
  - 用 `IntersectionObserver` 检测 in-view 状态
  - 默认渲染骨架 / blur-placeholder（可用 Emby `BlurHash` 字段，存在 `ImageBlurHashes`）；进入视口后 `src` 才赋值真实 URL
  - 移除现有「立即取图」逻辑
- 暴露 `useLazyImage(url)` composable（`composables/useLazyImage.ts`）。

### 虚拟网格

- 新建 `src/components/common/VirtualGrid.vue`：
  - props: `items`, `itemHeight`, `itemMinWidth`, `gap`, `overscan`
  - 自适应列数：基于容器宽度 / `itemMinWidth + gap`
  - 仅渲染窗口内 + overscan 的行
  - 使用 `transform: translateY()` 来 offset 可见行
- 在 `views/LibraryView.vue` 中接入 VirtualGrid。
- HomeView 的"继续观看"行较短，沿用普通网格。

### 首屏 / 动画

- `App.vue` 添加 `<Suspense>` 包裹路由切换，给 LibraryView 加 fallback。
- 使用 `view-transition-name` 让海报点击转场到详情页时连贯。
- Pinia store 增加 `prefetched` 标记，避免重复请求。

---

## 3. 快捷键 / 全局热键

### 目标

- 播放页内全键盘操作。
- 全局热键（系统范围）允许用户绑定"播放/暂停"、"显示窗口"、"音量上下"。
- 设置页有一个全键映射查看 / 重绑定面板。

### 本地快捷键

- 新增 `src/composables/useKeyboard.ts`：注册键 → handler 的 map，在 `mount` 时绑定 `keydown`，在 unmount 时清理。
- `views/PlayerView.vue` 内使用：

| 键 | 行为 |
|----|------|
| Space | 切换播放 / 暂停 |
| ← | 后退 10 秒 |
| → | 前进 10 秒 |
| Shift + ← | 后退 60 秒 |
| Shift + → | 前进 60 秒 |
| ↑ | 音量 +5 |
| ↓ | 音量 -5 |
| M | 静音切换 |
| F | 切换全屏 |
| S | 字幕面板 |
| D | 弹幕开关 |
| + / = | 速度 +0.1 |
| - / _ | 速度 -0.1 |
| [ | 字幕延迟 -100ms |
| ] | 字幕延迟 +100ms |
| 0 ~ 9 | 跳到对应百分比 |
| Esc | 关闭面板 / 退出全屏 |

### 全局热键

- 后端：
  - `Cargo.toml` 增加 `tauri-plugin-global-shortcut = "2"`
  - `capabilities/default.json` 增 `global-shortcut:default`
  - `lib.rs` `Builder::default().plugin(tauri_plugin_global_shortcut::Builder::new().build())`
  - `commands::shortcuts`：`register_shortcut(combination, action)`、`unregister_shortcut(combination)`
- 默认绑定：
  - `MediaPlayPause` → `play_pause`
  - `MediaStop` → `stop`
  - `Ctrl+Alt+Space` → `toggle_window`

### 设置面板

- `views/SettingsView.vue` 增加"快捷键"分组：
  - 本地热键（只读列表）
  - 全局热键（可点 + 录键修改）
- `stores/settings` 扩 `AppSettings.global_shortcuts: Vec<{action, combination}>`。

---

## 实施顺序

按照大类 → 子任务，整体推进。每完成一个子项调用 `寸止` 确认。

```
rc-1 (plan written; this doc)
rc-2 → rc-3 → rc-4 → rc-5 → 寸止
perf-1 (skip, see this doc)
perf-2 → perf-3 → perf-4 → 寸止
key-1 (skip)
key-2 → key-3 → key-4 → 寸止
```

## 用户硬性规则

- 只能通过 `寸止` 询问 / 反馈。
- 不要生成测试脚本。
- 不要编译；用户自己编译。
- 不要运行；用户自己运行。
- `请记住：` 触发即调用 `记忆` add，`project_path = a:/vsc/emby-player`。
