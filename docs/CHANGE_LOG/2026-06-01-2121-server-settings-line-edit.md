# 服务器线路编辑体验修正

## 背景

用户指出添加 / 编辑服务器时不应该要求手写服务端名称或类型；Emby / Jellyfin 类型和服务端名称应自动识别，端口必须能填写任意端口，User-Agent / Headers 应放在线路高级设置里；线路管理 UI 也不能继续表现成层层矩形框。同时用户指出 `1ms` 这类延迟显示不可信。

## 变更

- `src/views/SettingsView.vue`
  - 已保存服务器的编辑表单改为“地址 + 端口”主输入。
  - 线路名改为高级设置里的可选项，留空时继续自动使用线路序号。
  - 保存时统一走 `normalizeServerBaseUrl()`，支持 `443`、`8096` 或任意 `1-65535` 端口。
  - 读取旧线路 URL 时会拆出显式端口，避免用户编辑时只能面对整条 URL。
  - 编辑布局改成一行主输入 + 高级折叠设置，小宽度下自动堆叠，减少框套框观感。
- `src/utils/latency.ts`
  - `0-9ms` 延迟统一显示为 `<10ms`，不再展示 `0ms` / `1ms` 这种误导性的精确数值。

## 验证

- 通过：`npm.cmd run build`
  - 包含 `check:local-decode`，确认本机解码 / 禁服务端转码门禁仍然通过。
  - 包含 `check:no-planned-ui`、`vue-tsc --noEmit` 与 `vite build`。
- 通过：`git diff --check`

## 风险

- 本阶段是设置页表单与显示修正，没有改动真实登录、探测、播放或转码协商链路。
- Codex in-app Browser 当前没有可连接控制通道，视觉验收没有写成通过；后续如浏览器通道恢复，应再打开设置页做一次人工可视复核。

## 回滚

- 还原 `src/views/SettingsView.vue`、`src/utils/latency.ts`，并删除本日志即可。
