# 2026-06-10 22:45 外部播放器分组（外部 mpv / PotPlayer）

## 背景
按参考截图（`SETTINGS_REFERENCE_HILLSLITE.md`·外部播放器）复刻：开启外部 mpv 播放器、
外部 mpv 播放器位置、外部 mpv 使用代理、开启外部 PotPlayer 播放器、PotPlayer 位置。
PotPlayer 属用户显式选择的外部播放器（播放内核仍仅随包 mpv，本机解码硬约束不变——
外部播放器只接收已通过本机直连校验的直链）。

## 变更
- Rust 模型：`external_mpv_enabled/path/use_proxy`、`external_potplayer_enabled/path`
  （nullable patch 字段用 `deserialize_nullable_field`）。
- `play_external` 选择顺序：外部 mpv（开启且有路径）→ PotPlayer（开启且有路径）→
  旧版通用路径 → 系统默认打开。
  - mpv 组：沿用 mpv 参数构造 + 进度回报脚本；「使用代理」且自定义代理时插入
    `--http-proxy`（系统代理模式由子进程环境变量继承）。
  - PotPlayer 组：`<url> /seek=hh:mm:ss` 启动（detached，无进度回报——PotPlayer
    无 stdout 协议，截图原版同样不回报）。
  - 开启但未填路径时报错提示，不静默回退。
- 设置页外部播放器面板重排：mpv 组（开关/位置/选择/代理开关）→ PotPlayer 组
  （开关/位置/选择）→ 其他播放器路径（以上未开启时生效）+ 启动参数；
  汇总标签显示 外部 mpv / PotPlayer / 文件名 / 系统默认。
- TS 类型 + 三处默认值 + Electron store。

## 验证
- `npm run build` 绿（9.12s）；`cargo check --features mpv-embedded` 绿（34.3s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：开启 PotPlayer + 填路径 → 详情页「外部播放」用 PotPlayer 起播并 seek；
  mpv 组开启时优先 mpv 并回报进度。
