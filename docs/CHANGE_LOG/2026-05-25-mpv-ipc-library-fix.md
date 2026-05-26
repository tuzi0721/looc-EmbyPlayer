# 2026-05-25 — MPV IPC 与媒体库交互修复

## 问题现象

1. **媒体库点不开 / 点击无反应** — 离开播放页后 MPV 原生子窗口未销毁，透明 HWND 挡在 WebView 上方。
2. **无法播放** — 报错 `mpv error: ipc send: channel closed`。
3. **偶发崩溃** — 在 mpv 仍运行时销毁嵌入窗口，进程退出但 IPC 状态未重置。

## 根因

| 问题 | 原因 |
|------|------|
| 点击被挡 | `embedAttach` 创建的 Win32 子窗口在离开播放页后仍存在 |
| channel closed | `ensure_started()` 发现 `inner` 已存在就直接返回，不检查 mpv 进程是否已退出 |
| 时序错误 | `App.vue` 路由 watch 在 `PlayerView` 卸载前调用 `embedDetach`，销毁 HWND 导致 mpv 崩溃 |
| 卸载顺序 | `PlayerView` 先 `embedDetach` 再 `stop()`，mpv 在窗口销毁后仍被发送命令 |

## 修复内容

### Rust（`src-tauri`）

- **`ipc.rs`**
  - `detach_embedded()` 改为 async：先 `shutdown()` 杀掉 mpv 并清空 IPC，再 `DestroyWindow`
  - `ensure_started()` 用 `try_wait()` 检测进程是否存活，死亡则自动重启
  - `shutdown()` 先 drop `cmd_tx` 再 kill 子进程
- **`manager.rs`** — `detach_embedded()` 改为 async
- **`player.rs`**
  - `embed_detach` 命令 await 完整 teardown
  - `stop` 命令在 IPC 失败时 fallback 到 `shutdown()`

### 前端

- **`App.vue`** — 路由切换时只移除 `embedded-player` CSS，不再提前 `embedDetach`
- **`PlayerView.vue`** — 卸载顺序改为：`stop()` → 移除 CSS → `embedDetach()`
- **`PosterCard.vue`** — 使用 `@activate` 事件，VirtualGrid 内点击更可靠
- **`LibraryView` / `DetailView`** — 路由 id 变化时重新加载；详情页增加错误态
- **`DetailView.vue`** — 隐藏无数据的演职人员占位区

## 验证步骤

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-playback-flow.ps1
powershell -ExecutionPolicy Bypass -File scripts\run-release.ps1
```

手动测试清单：

1. 首页 → 点媒体库缩略图 → 进入列表
2. 点任意条目 → 进入详情 → 点播放 → 视频正常内嵌播放
3. 返回详情 → 再进媒体库 → 卡片可点击
4. 重复播放 2–3 次，不应出现 `channel closed`

## UI 评审（详情页）

**合理的部分：**

- Hero 大图 + 播放/收藏/分享按钮布局清晰
- 简介独立区块，不与播放按钮重叠
- 横滑选集符合 Hills Lite 参考

**2026-05-25 自适应改进：**

- Hero 高度改为 `clamp(320px, 42vh, 480px)`
- ≤960px：版本/音轨/字幕下拉改为横排换行
- ≤640px：播放按钮全宽、选集区纵向堆叠

**待改进（Phase 2）：**

- 演职人员需接 Emby People API
- 详情页缺少进度条（继续观看百分比）

## 产物路径

- Release exe: `src-tauri\target\release\emby-player.exe`
- Bundled mpv: `src-tauri\target\release\resources\mpv\mpv.exe`
