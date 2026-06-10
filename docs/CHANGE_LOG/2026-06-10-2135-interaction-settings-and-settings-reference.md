# 2026-06-10 21:35 设置·交互（快进/快退/长按倍速）+ 设置页权威清单

## 背景
用户提供参考 app 设置页实机截图 5 张（权威规格）。据此新增
`docs/SETTINGS_REFERENCE_HILLSLITE.md`（全量 50+ 项逐项盘点：已有/部分/缺失 + 实施优先级），
并补齐「播放器·交互」三项设置。

## 变更
- Rust：`AppSettings.seek_forward_seconds / seek_backward_seconds`（默认 10，clamp 1–300）、
  `long_press_speed_rate`（默认 2.0，clamp 1.1–5.0）+ SettingsPatch 落盘。
- 前端：TS 类型 + 三处默认值 + Electron store 默认值；`SettingsView` 新增「交互」面板
  （播放器分组首位，按参考顺序：快进时间/快退时间/倍速播放速度）。
- `PlayerView` 接线：快进/快退按钮与 ←→ 快捷键使用设置值（含按钮 title 动态化；
  原 +30s 前进按钮统一为设置值）；长按倍速 `setSpeed(2)` → 设置值，速度指示徽标同步显示。

## 验证
- `npm run build`（vue-tsc+vite+门禁）绿；`cargo check --features mpv-embedded` 绿（21s）；
  `node --check` store.mjs 绿；无 lint。
- 行为待真机：改快进为 30s → 按钮 title/步长生效；长按视频 → 显示并应用自定义倍速。

## 配套
- `SETTINGS_REFERENCE_HILLSLITE.md` 实施优先级：网络代理/忽略SSL(下一项) → 首选语言/强制立体声 →
  弹幕扩展 → 已看阈值/记忆播放 → 缓存管理 → 版本策略/WebDAV/日志/mpv.conf → i18n/主题色。
- ⚠ PotPlayer 外部播放器与「仅随包 mpv」硬约束冲突，列为需用户裁决项。
