# 2026-05-30 01:30 播放器控制栏宽度档位

## 目标

让播放页底部控制栏在不同窗口宽度下按明确优先级收纳，避免依赖自然换行导致窄窗口拥挤；同时清掉没有音轨时的无动作占位入口。

## 变更

- `PlayerView.vue` 为底部控制栏控件补充 `data-control` 稳定标识，便于后续样式、排查和自动化验证定位。
- 新增 `data-hide-below="wide|medium|small"` 三档隐藏规则：倍速/截图优先收纳，队列前后/音轨/章节在中等宽度收纳，快退/快进/音量在极窄宽度收纳。
- CSS 新增 1180px、920px、620px 三档媒体查询，窄屏下同步收紧按钮尺寸、时间宽度和底栏间距。
- 删除无音轨时仍显示的静态音轨按钮，避免出现不可操作入口。

## 验证

已通过：

```powershell
data-hide-below / data-control / 1180px / 920px / 620px 落点检查
无音轨占位按钮残留检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。当前未在真实播放会话中做控制栏 resize 人工目检，本轮验证覆盖静态落点和完整构建。

## 当前状态

- 播放器控制栏已经按宽度档位收纳，窄窗口优先保留播放、字幕/弹幕、设置、选集和全屏等高频入口。
- 空音轨按钮已移除，不再展示无动作控件。
- 后续如接入更多播放工具按钮，应继续复用 `data-control` 与 `data-hide-below` 档位，而不是依赖自然换行。
