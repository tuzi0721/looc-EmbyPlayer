# 2026-06-12 11:09 设置页扁平化重构（CH-3 规格 · CH-1 接手实现）

## 背景
按 `docs/SETTINGS_FLAT_REGROUP_SPEC.md`（任务 task_mqac977h_usmtoh）把 `SettingsView.vue`
从「行 + 弹出玻璃面板」改为截图式扁平分组列表：顶层为可折叠 section（标题 + 折叠摘要 +
展开箭头），section 内是一行行设置项（左：label + 一句描述；右：控件），行间用分隔线，
不再嵌套卡片 / 玻璃面板。原计划 CH-2 实现，用户指示改由 CH-1 接手。

## 变更
### 组件
- `components/settings/SettingRow.vue`：增强 CH-2 脚手架，新增 🔸高级 / 🆕新 徽标、
  `clickable` 跳转行（渲染为 button + emit click + disabled）、block 控件占满整行。
- `components/settings/SettingsSection.vue`：沿用 CH-2 既有实现（折叠摘要、chevron 旋转、
  `.settings-subhead` 子标题样式）。

### 前端
- `views/SettingsView.vue`：模板整体重写为 14 个扁平 section（通用默认展开，其余折叠）。
  - 状态：单开 `openPanel: PanelId` → 多开 `expanded: Set<SectionId>`，互不影响。
  - 播放器 section 内用 `.settings-subhead` 分 6 子组：解码与输出 / 音轨与语言 /
    播放行为 / 交互 / 显示与统计 / 调试。
  - 折叠态摘要复用既有 computed（themeLabel / heroStyleLabel / danmakuSummary /
    externalPlayerSummary / downloadDirectorySummary / cacheSummary / mpvBackendLabel）。
  - 条件行保持原 v-if/disabled 语义（hwdecMode、httpProxyUrl、externalMpvPath、
    externalPotplayerPath、danmakuBottomReservePct）；片头/片尾秒数改为依赖跳过开关显示。
  - 🆕 补 UI：通用「窗口亚克力效果」(enableWindowVibrancy)、网络「默认 User-Agent」
    (defaultUserAgent)。
  - 旧 `?c=` 深链兼容：`sectionFromQuery` 映射 theme/appearance→general、
    interaction/enhancement→player、fileServices/files/connectors/sources/library→library、
    download→downloads、external-player→externalPlayer，其余同名。
  - save()/store / 服务器编辑 / 缓存 / 备份 / 下载目录等逻辑全部保留不动。

## 两处取舍（规格留给实现）
- `fileServiceCapabilities`（14 条能力说明）：降级为媒体库 section 尾部🔸「连接器能力说明」
  折叠 `<details>`，保留信息但不占主视觉。
- Trakt 同步 section：OAuth 授权流缺失，且项目有 `check:no-planned-ui` 硬性约束，按规格
  「倾向暂不渲染」处理——不渲染该 section（traktSync×5 + traktUsername 推迟到 OAuth 落地后）。

## 验证
- `vue-tsc --noEmit` 绿（无类型错误）。
- `vite build` 绿（7.11s，SettingsView 52.97 kB）。
- `node scripts/check-no-planned-ui.mjs` 绿、`node scripts/check-local-decode-guard.mjs` 绿。
- ReadLints 无错误。
- 覆盖核验：现有 SettingsView 设置项 1:1 迁移，新增 enableWindowVibrancy / defaultUserAgent；
  subtitle×9 完成镜像（保存即写 AppSettings，播放器读取生效）；仅 trakt 组按上述取舍推迟。

## 残余
Trakt 同步 section（待 OAuth 授权流落地后补完整 UI）；字幕镜像目前为「写默认值」，
未在设置页内实时联动当前播放（设置页无活动播放器，符合预期）。
