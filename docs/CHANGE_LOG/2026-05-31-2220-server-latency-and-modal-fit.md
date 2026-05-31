# 服务器延迟显示与弹窗适配

- **时间**：2026-05-31 22:20 (UTC+8)
- **动机**：用户指出添加服务器不应挤掉旧服务器，并质疑线路延迟显示 `1ms` 不可信。复核发现追加逻辑本身已是新 id 追加，但 UI 仍直接显示毫秒精确值；同时窄宽度预览里“添加服务器”弹窗右侧会裁出视口，导致“保存”按钮不可点。
- **修改文件**：
  - `src/utils/latency.ts` — 新增统一延迟格式化，低于 10ms 的正值显示为 `<10ms`，秒级延迟显示为 `x.xs` / `xs`。
  - `src/components/common/LineStatusDot.vue` — 线路状态点改用统一延迟格式，不再展示 `1ms` 这种假精度。
  - `src/views/PlayerView.vue` — 播放源切换菜单的线路元信息同样复用统一延迟格式。
  - `src/components/login/AddServerDialog.vue` — 弹窗宽度改为视口约束，底部按钮可换行，移动/窄宽度下保存按钮保持可见。
- **风险**：仅改变展示格式和弹窗布局，不改变健康检查的真实耗时记录；如果后续需要诊断级精确值，可在开发日志或详情面板另行展示原始毫秒值。
- **回滚**：移除 `formatLatencyMs` 并恢复 `LineStatusDot` / 播放源菜单的原始毫秒拼接；弹窗样式恢复固定 `600px` 宽度即可。
- **验证步骤**：
  - `npm.cmd run build`
  - `git diff --check`
  - in-app Browser 打开 `http://127.0.0.1:1422/settings?c=servers`
  - 本地 mock Emby `System/Info/Public` 服务测活
  - in-app Browser 连续添加 `Latency Test` 与 `Second Test` 两个服务器
  - `npm.cmd run electron:build`
- **结果**：通过；窄视口弹窗中“保存”按钮可见可点，连续添加两个服务器后列表同时保留 `Latency Test` 与 `Second Test`；对本地 mock 服务测活后低延迟显示为 `<10ms`，不再出现 `1ms` 假精度。Electron unpacked 包完整性检查通过。
