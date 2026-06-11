# 2026-06-11 14:45 自研播放器弹幕·宿主侧喂数据（item3 方案 A 收尾）

## 背景
接上一批播放器侧弹幕覆层脚手架（`--danmaku-file` + QML overlay）。本批在宿主侧把
真实弹幕数据喂给独立播放器：取数 → 转 JSON → 写临时文件 → `--danmaku-file` 注入。

## 变更（Rust）
- `danmaku/mod.rs`：新增 `fetch_item_danmaku(client, item)`——复用默认 provider(dandanplay)
  的 `match_item`+`fetch`，按 Emby 条目尽力匹配并拉取弹幕，失败/未匹配返回 None。
- `mpv/standalone.rs`：`StandaloneStartRequest` 新增 `danmaku_file: Option<String>`；
  `build_args` 在非空时注入 `--danmaku-file=<path>`。
- `commands/player.rs`：
  - 新增 `build_standalone_danmaku_file(client, item, session_id)`——3s 超时内取弹幕，
    转成播放器 JSON（`{t,text,mode,color}`，DanmakuMode::Reverse→scroll），写
    `%TEMP%/hills-danmaku-<playSessionId>.json`，返回路径；超时/未命中/空返回 None
    （绝不阻塞起播）。
  - `play_standalone`：当 `danmaku_enabled_default` 开启时计算 `danmaku_file` 并传入请求。

## 验证
- `cargo check --features mpv-embedded` 绿（15.8s）；ReadLints 无错误。
- 播放器侧 overlay 已于上一批可视化验证（player-danmaku.png）。

## 残余 / 说明
- 真机弹幕能否出现取决于 dandanplay 是否匹配到该 Emby 条目（如「雪孩子」可能无匹配）；
  机制（取数→JSON→argv→overlay）已通，匹配命中属内容侧。
- 需把含弹幕支持的新播放器打包进 `resources/player/`（与既有"player 需重新 staging/打包"残余一致）；
  旧打包播放器收到 `--danmaku-file` 会作为未知 mpv 选项忽略，不致命。
- 弹幕开关/字号/透明度/速度/粗体等与弹幕设置的联动、滚动轨道防重叠为后续优化；
  当前播放器内 overlay 用脚手架默认值，弹幕开关由播放器内按钮控制。
- 起播延迟：取数有 3s 超时上限，仅弹幕开启时；如需零延迟可后续改 stdin IPC 异步注入。
