# 2026-06-10 23:35 首选版本策略 + mpv.conf 编辑器

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·播放器）复刻两项：
- 「首选版本」：条目存在多个可本机解码版本时的自动选源策略。
- 调试「编辑 mpv.conf」：用户可编辑的 mpv 配置，注入每次 mpv 启动。

## 变更
### 首选版本策略
- Rust：`PreferredVersionStrategy` 枚举（default/hdr-first/sdr-first/high-bitrate/
  low-bitrate/high-framerate）+ `preferred_version_strategy` 设置。
- `emby/models.rs`：`MediaStream` 增加 `VideoRange/RealFrameRate` 字段；
  `MediaSource` 增加 `is_hdr()/effective_bitrate()/max_video_framerate()`；
  新增 `pick_preferred_local_source(sources, strategy)`（稳定排序，服务器顺序为并列
  决胜；default 直接取第一个可本机解码源，与原行为一致）。
- 接入三处自动选源：`play`、`pick_local_media_source`（get_playback_source/
  外部播放公用）、`play_external`。手动指定 mediaSourceId 时不受影响。
- 设置页播放器面板新增六段选择。

### mpv.conf 编辑器
- `mpv/paths.rs`：`resolve_user_mpv_conf()` → `%APPDATA%/app.embyplayer/mpv.conf`
  （两个运行时共用同一路径）。
- `spawn_mpv_ipc` / Electron `mpv.mjs`：存在时追加 `--include=<conf>`（在默认参数
  之后加载，用户配置可覆盖默认值）。
- 新命令 `ensure_mpv_conf`（缺失时创建带注释模板，返回路径）+ Electron 等价实现；
  设置页「编辑 mpv.conf」按钮 = ensure + open_path 系统编辑器打开。
- Electron mpv 启动参数同步补齐 alang/slang/强制立体声/自定义代理透传（与 Rust IPC
  后端对齐）。

## 验证
- `npm run build` 绿（6.83s）；`cargo check --features mpv-embedded` 绿（31.3s）；
  `node --check` ×3 绿；Electron coverage 绿（112 cmd/108 handlers/5 no-op）；无 lint。
- 行为待真机：多版本条目选「高码率」→ 自动挑码率最高版本；mpv.conf 写入
  `sub-font-size=60` → 下次播放字幕变大。
