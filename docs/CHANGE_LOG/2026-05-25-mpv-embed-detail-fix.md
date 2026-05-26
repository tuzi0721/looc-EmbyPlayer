# MPV IPC + embed fix (2026-05-25)

## 问题

1. 详情页 Hero 区播放按钮与简介挤在一起，布局被顶高
2. 播放页 mpv 弹出独立窗口，`mpv ipc connect timeout`

## 根因

### IPC timeout
代码把 app 当成 pipe **服务端**（`ServerOptions::create` + `server.connect()`），
但 mpv 的 `--input-ipc-server` 会让 **mpv 自己监听**，app 应作为 **客户端** 连接。

### 未内嵌
IPC 模式用了 `--force-window=yes`，且播放页只在 `mpvBackend=embedded` 时才 `embedAttach`。
默认 IPC 模式不会创建子窗口 / 传 `--wid`。

## 修复

- `ipc.rs`：spawn mpv 后用 `ClientOptions::open` 重试连接 pipe
- `MpvIpcBackend`：支持 `bind_embedded` + `--wid` + `--force-window=no`
- `manager.rs`：IPC 模式也走 embed_rect / embed_show
- `PlayerView.vue`：播放页始终 embedAttach
- `DetailView.vue`：Hero 固定 420px；简介移到 Hero 下方独立区块；播放与圆形按钮同一行

## 验证

重新打开 `emby-player.exe`，进详情页看布局，点播放应无独立 mpv 窗口且无 timeout。
