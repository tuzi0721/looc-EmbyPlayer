# 设置页扁平化重构·分组清单（CH-3 产出，供 CH-2 实现）

> 任务：task_mqac977h_usmtoh ｜ 日期：2026-06-12
> 目标：把 `SettingsView.vue` 从「行 + 弹出玻璃面板」改为截图式扁平分组列表：
> 顶层为可折叠 section（标题 + 展开箭头），section 内是一行行设置项
> （左：label + 一句描述；右：控件），行间用分隔线，**不再嵌套卡片/矩形面板**。
>
> 控件类型图例：开关 / 滑块 / 下拉（或分段 seg）/ 输入 / 按钮 / 跳转 / 只读。
> 标注图例：🔸高级项（section 内置于尾部或折叠进「高级」子区）；🆕 现状无 UI、本次可补；⏸ 预留（可暂不渲染）。

## 总览（section 顺序与默认状态）

| # | section id | 中文标题 | 默认状态 | 备注 |
|---|---|---|---|---|
| 1 | general | 通用 | **展开** | 主题/托盘/入口 |
| 2 | servers | 服务器 | 折叠 | 列表型自定义块 |
| 3 | library | 媒体库 | 折叠 | 首页与文件服务 |
| 4 | player | 播放器 | 折叠 | 行最多，内部用子标题分组 |
| 5 | subtitle | 字幕 | 折叠 | ⏸ 可选镜像（现状在播放器内调） |
| 6 | danmaku | 弹幕 | 折叠 | |
| 7 | externalPlayer | 外部播放器 | 折叠 | |
| 8 | downloads | 下载 | 折叠 | |
| 9 | backup | 备份与还原 | 折叠 | |
| 10 | sync | 同步 | 折叠 | ⏸ Trakt 预留 |
| 11 | network | 网络 | 折叠 | 🔸整体偏高级 |
| 12 | shortcuts | 快捷键 | 折叠 | 嵌入 ShortcutsPanel |
| 13 | cache | 缓存 | 折叠 | 展开时拉取用量 |
| 14 | about | 关于 | 折叠 | 只读信息行 |

旧 `?c=` 查询参数需继续生效，映射：`theme/appearance→general`、`interaction/enhancement→player`、`fileServices/files/connectors/sources/library→library`、其余同名（`download→downloads`、`external-player→externalPlayer`）。

---

## 1. 通用 general（默认展开）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| theme | 主题模式 | 分段（深色/浅色/Auto） | 应用整体配色 |
| blurStrength | 模糊强度 | 滑块 0–48 | 玻璃模糊效果强度 |
| enableWindowVibrancy 🆕🔸 | 窗口亚克力效果 | 开关 | 窗口背景材质，重启后生效 |
| closeToTray | 关闭时最小化到托盘 | 开关 | 点关闭按钮隐藏到托盘而不退出 |
| —（跳转） | 通知中心 | 跳转（未读数 badge） | 查看应用通知；`notifications.toggleCenter()` |
| —（跳转） | 遥控器 | 跳转 | 控制其他 Emby/Jellyfin 客户端 |

## 2. 服务器 servers（默认折叠）

非标准行，保留现有列表交互，去掉玻璃卡片底、改用分隔线：

- 行首：「已保存的服务器」+ 右侧「添加」按钮（AddServerDialog）。
- 每个服务器一组行：名称 + 操作（测活/编辑/隐藏[`hiddenServerIds`]/删除）。
- 线路子行：名称、脱敏 URL、状态点（LineStatusDot）、「设为当前」。
- 编辑态：地址/端口/启用，🔸高级 details 内：线路名/User-Agent/Headers；底部「新增线路」「保存」。

## 3. 媒体库 library（默认折叠）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| homeHeroStyle | 首页轮播图风格 | 分段（标准/巨幕） | 首页顶部 Hero 区样式 |
| hideContinueWatching | 隐藏继续观看 | 开关 | 首页不显示继续观看区块 |
| showCoverRating | 显示封面评分 | 开关 | 海报角标显示社区评分 |
| hideJavCodes 🔸 | JAV 番号过滤 | 开关 | 隐藏番号命名的内容 |
| —（跳转） | 打开本地文件 | 按钮 | 选择单个视频用内嵌 mpv 播放（仅桌面端可用） |
| —（跳转） | 本地文件夹 | 跳转 | 浏览本地目录作为媒体库 |
| —（跳转） | WebDAV | 跳转 | 连接 WebDAV 服务浏览播放 |
| —（跳转） | Alist / OpenList | 跳转 | 连接 Alist 站点浏览播放 |

> 现有 `fileServiceCapabilities` 能力说明列表（14 条）信息密度低，建议降级为 section 尾部一个🔸「连接器能力说明」折叠 details，或直接移除（CH-2 取舍）。

## 4. 播放器 player（默认折叠；行间用小子标题分组，仍是同一 section）

### 解码与输出
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| mpvBackend | 播放核心 | 只读 | Embedded mpv / IPC mpv |
| videoOutputDriver | 视频输出驱动 | 分段（gpu-next/gpu） | 下次播放生效 |
| hardwareDecoding | 硬件解码 | 开关 | 用 GPU 解码降低 CPU 占用 |
| hwdecMode | 硬解方式 | 下拉（自动/D3D11VA/Vulkan/Copy） | 仅硬解开启时显示；下次播放生效 |
| lowQualityDecoding 🔸 | 低质量视频解码 | 开关 | 低性能设备减负；下次播放生效 |
| mpvCacheMb | 播放缓存（MB） | 输入（数字） | mpv demuxer 缓存上限，默认 256 |
| mpvCacheSecs 🔸 | 最大缓存时长（秒） | 输入（数字） | 0 = mpv 默认 |

### 音轨与语言
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| preferredAudioLanguage | 首选音频语言 | 下拉（默认/中文/日语/英语/韩语） | 下次播放生效 |
| preferredSubtitleLanguage | 首选字幕语言 | 下拉（同上） | 下次播放生效 |
| forceStereoAudio | 强制输出立体声 | 开关 | 多声道下混为立体声；下次播放生效 |

### 播放行为
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| preferredVersionStrategy | 首选版本 | 下拉（默认/HDR优先/SDR优先/高码率/低码率/高帧率） | 多版本自动选源策略 |
| markWatchedThresholdPct | 标记已看阈值 | 滑块 50–100%（带数值） | 播放进度超过此值标记为已观看 |
| skipIntroOutroEnabled | 自动跳过片头/片尾 | 开关 | 按固定秒数跳过 |
| skipIntroSeconds | 片头跳过秒数 | 输入（0–600） | 依赖上一项开启 |
| skipOutroSeconds | 片尾跳过秒数 | 输入（0–600） | 依赖跳过开关开启 |
| screenshotIncludeSubtitles | 截图包含字幕 | 开关 | 播放器截图时烧入字幕 |

### 交互
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| seekForwardSeconds | 快进时间（秒） | 输入 1–300 | 方向键/按钮单次快进步长 |
| seekBackwardSeconds | 快退时间（秒） | 输入 1–300 | 单次快退步长 |
| longPressSpeedRate | 长按倍速 | 输入 1.1–5 | 长按时的播放速度 |

### 显示与统计
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| showNetworkSpeed | 右上角网速 | 开关 | 播放时显示实时网速 |
| statsOverlayMode | 统计浮层 | 分段（WinUI/mpv OSD） | 播放统计信息样式 |
| blackoutOtherDisplays 🔸 | 全屏遮黑其他副屏 | 开关 | 多显示器全屏时遮黑副屏 |
| —（画质增强） | Anime4K | 只读 + 描述 | 播放器内菜单切换（off/A快/A/B/C/高质），对应 `anime4kMode` |
| —（画质增强） | Windows HDR | 按钮「打开系统设置」 | 仅 Windows 可用（ms-settings:display） |

### 调试 🔸（全部高级项）
| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| preserveTrackSwitchCache | 切换轨道时保留缓存 | 开关 | 关闭可解决部分切轨问题 |
| appendAuthQuery | 附加授权查询参数 | 开关 | 流地址附加 api_key 参数，兼容部分服务器 |
| playerLogEnabled | 播放器日志 | 开关 | 下次播放生效 |
| —（按钮） | 打开日志文件夹 | 按钮 | `api.openPlayerLogDir()` |
| —（按钮） | 编辑 mpv.conf | 按钮 | `api.ensureMpvConf()` + 打开；下次播放生效 |

## 5. 字幕 subtitle（默认折叠）⏸ 可选

> 现状：以下字段仅在播放器内 `SubtitlePanel` 调整，设置页无 UI。本 section 为「镜像入口」，CH-2 可先放一行「字幕样式在播放器内调整」跳转说明，二期再做完整镜像。若做镜像，行如下：

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| subtitleScale | 字幕大小 | 滑块 | 相对缩放倍率 |
| subtitleBold | 字幕粗体 | 开关 | |
| subtitleTextColor | 字体颜色 | 取色/输入 | 十六进制色值 |
| subtitleOutlineColor | 描边颜色 | 取色/输入 | |
| subtitleOutlineSize | 描边宽度 | 滑块 | |
| subtitleShadowOffset | 阴影偏移 | 滑块 | |
| subtitlePositionPct | 主字幕位置 | 滑块 0–150% | 100 = 底部默认 |
| subtitleSecondaryPositionPct | 次字幕位置 | 滑块 | 0 = 顶部默认 |
| subtitleForceStyle 🔸 | 强制覆盖 ASS 样式 | 开关 | 覆盖内嵌字幕自带样式 |

## 6. 弹幕 danmaku（默认折叠）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| danmakuEnabledDefault | 开启弹幕 | 开关 | 数据来源 DanDanPlay API |
| danmakuFontSize | 字号 | 滑块 12–48px（带数值） | |
| danmakuOpacity | 透明度 | 滑块 0.2–1（显示 %） | |
| danmakuSpeed | 速度 | 滑块 0.5–2.5x | |
| danmakuScrollMaxRows | 滚动弹幕最大行数 | 滑块 1–20 | |
| danmakuTopMaxRows | 顶部弹幕最大行数 | 滑块 1–20 | |
| danmakuBottomMaxRows | 底部弹幕最大行数 | 滑块 1–20 | |
| danmakuBold | 粗体 | 开关 | |
| danmakuRememberSelection | 记忆手动选择的弹幕 | 开关 | 下次播放同一剧集自动恢复 |
| danmakuAvoidSubtitles | 避让字幕 | 开关 | 弹幕避开字幕区域 |
| danmakuBottomReservePct | 底部避让区域 | 滑块 8–36%（依赖避让开启） | 底部保留高度 |

## 7. 外部播放器 externalPlayer（默认折叠）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| externalMpvEnabled | 外部 mpv 播放器 | 开关 | 用独立 mpv 程序播放 |
| externalMpvPath | mpv 位置 | 输入 + 选择按钮 | 仅 mpv 开启时显示 |
| externalMpvUseProxy | mpv 使用代理 | 开关 | 自定义代理时传给 mpv；仅 mpv 开启时显示 |
| externalPotplayerEnabled | 外部 PotPlayer 播放器 | 开关 | |
| externalPotplayerPath | PotPlayer 位置 | 输入 + 选择按钮 | 仅 PotPlayer 开启时显示 |
| externalPlayerPath 🔸 | 其他播放器路径 | 输入 + 选择/清除按钮 | 以上未开启时生效；留空用系统默认 |
| externalPlayerArgs 🔸 | 启动参数 | 输入 | 支持 {headers} {userAgent} {url} 占位符 |

## 8. 下载 downloads（默认折叠）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| downloadDirectory | 保存目录 | 输入 + 选择/打开/清除按钮 | 留空使用默认目录 |
| —（跳转） | 下载中心 | 跳转（进行中任务数 badge） | 查看与管理下载任务 |

## 9. 备份与还原 backup（默认折叠）

| 项 | label | 控件 | 描述 |
|---|---|---|---|
| —（api.exportConfig） | 导出配置 | 按钮 | 导出设置、服务器、账号和快捷键 |
| —（api.importConfig merge） | 合并导入 | 按钮 | 与现有配置合并 |
| —（api.importConfig replace） | 替换导入 | 按钮（危险色 + confirm） | 覆盖当前全部配置 |
| — | 状态行 | 只读 | 显示导出路径/导入结果 |

> 整个 section 受 `backupAvailable` 门控（无原生运行时则禁用）。

## 10. 同步 sync（默认折叠）⏸ 预留

> 现状：5 个 trakt 字段在 AppSettings 中存在但**无任何 UI**，OAuth 授权流未实现。建议本次先渲染骨架并整体禁用，或暂不渲染（CH-2 取舍，倾向后者，仅留 section 标题 + 「即将推出」描述）。

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| traktSyncEnabled 🆕 | Trakt 同步 | 开关 | 同步观看记录到 Trakt |
| traktUsername 🆕 | Trakt 用户名 | 输入/只读 | 授权后自动填充 |
| traktSyncWatched 🆕 | 同步已观看 | 开关 | |
| traktSyncRatings 🆕 | 同步评分 | 开关 | |
| traktSyncFavorites 🆕 | 同步收藏 | 开关 | |

## 11. 网络 network（默认折叠，🔸整体偏高级）

| AppSettings key | label | 控件 | 描述 |
|---|---|---|---|
| networkProxyMode | 网络代理 | 分段（不使用/跟随系统/自定义） | 重启后生效 |
| httpProxyUrl | HTTP 代理地址 | 输入 | 仅自定义模式显示；如 http://127.0.0.1:7897 |
| ignoreSslErrors | 忽略 SSL 证书校验 | 开关 | 重启后生效；自签证书服务器用 |
| heartbeatIntervalSecs 🔸 | 心跳保号周期（秒） | 输入 | 默认 180 |
| healthCheckIntervalSecs 🔸 | 线路测活周期（秒） | 输入 | 默认 60 |
| raceTimeoutMs 🔸 | 线路竞赛超时（ms） | 输入 | 默认 3500 |
| requestTimeoutMs 🔸 | 请求超时（ms） | 输入 | 默认 15000 |
| defaultUserAgent 🆕🔸 | 默认 User-Agent | 输入 | 线路未单独配置时使用 |

## 12. 快捷键 shortcuts（默认折叠）

- 展开后直接嵌入现有 `ShortcutsPanel` 组件，不加卡片底。

## 13. 缓存 cache（默认折叠）

| 项 | label | 控件 | 描述 |
|---|---|---|---|
| —（api.getCacheUsage） | 缓存占用 | 只读列表（每类一行：label + 大小） | section 展开时自动拉取 |
| — | 刷新 | 按钮 | 重新统计 |
| —（api.clearAppCache） | 清理缓存 | 按钮 | 使用中的缓存重启后释放 |

> section 标题右侧折叠态摘要显示总大小（现有 `cacheSummary`）。

## 14. 关于 about（默认折叠）

全部只读行：版本（v0.1.0）、运行壳（Tauri/Electron/Web）、平台、服务器数量、当前账号、播放核心（mpvBackend）。尾部两个跳转按钮：备份配置（展开 backup）、服务器（展开 servers）。

---

## 实现备注（给 CH-2）

1. **结构**：`openPanel: PanelId`（单开）建议改为 `expanded: Set<string>`（多开互不影响），或保留单开但语义变为「当前展开的 section」。新 section id 见总览表。
2. **行组件**：建议抽 `SettingRow`（props: label / description / 右侧 slot）统一分隔线与排版，替代现有 `.field` / `.field--inline` / `.row` 三套混用。
3. **折叠态摘要**：保留现有 computed（themeLabel、danmakuSummary、externalPlayerSummary、downloadDirectorySummary、cacheSummary 等）显示在 section 标题右侧。
4. **条件显示行**（hwdecMode、httpProxyUrl、externalMpvPath、skipIntro/OutroSeconds、danmakuBottomReservePct 等）保持现有 v-if/disabled 逻辑。
5. **保存逻辑不变**：全部走 `save(key, value)` → `settings.update`，不需要动 store 与后端。
6. 覆盖核验：AppSettings 共 66 key，本清单全部归位；其中 4 个🆕无现状 UI（enableWindowVibrancy、defaultUserAgent + trakt×5 计为一组）、subtitle×9 为可选镜像、anime4kMode 只读展示。其余均为现有 UI 的 1:1 迁移。
