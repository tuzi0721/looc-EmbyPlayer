# 假入口与 no-op 扫描

## 背景

用户要求清理无关代码和无法使用的东西，不能把假入口留在项目里。本阶段针对源码、脚本入口和当前状态文档再扫一遍占位、计划、未实现、fake/mock/demo/no-op 等痕迹。

## 验证

- 通过：`npm.cmd run check:no-planned-ui`
  - 76 个源码文件扫描通过。
- 通过：`npm.cmd run check:electron-commands`
  - 101 个 renderer commands 与 101 个 Electron handlers 对齐。
  - 显式 no-op 命令为 0。
- 扫描：`rg -n "fake|mock|demo|placeholder|no-op|noop|not implemented|coming soon|待接入|计划中|未接入|未实现|敬请期待" src electron scripts package.json docs\CURRENT_STATE.md docs\STANDARDS.md -g "!src-tauri/target/**"`
  - 源码命中的 `placeholder` 均为输入框 placeholder 或图片缺省占位样式。
  - `fake/demo` 命中只存在于 smoke 测试数据或测试脚本凭据中，不是用户界面入口。

## 变更

- `docs/CURRENT_STATE.md` 将“fake Emby”措辞改为“本地测试 Emby”，避免当前状态快照误导。
- 运行时代码不变。

## 风险

- 本阶段是扫描与文档措辞修正；没有删除真实功能，也没有改动播放器或服务器逻辑。

## 回滚

- 删除本日志并还原 `docs/CURRENT_STATE.md` 的措辞即可。
