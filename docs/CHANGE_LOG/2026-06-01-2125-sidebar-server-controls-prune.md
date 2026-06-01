# 侧边栏服务器管理控件收敛

## 背景

用户指出主界面左下角 / 侧边栏功能过于杂乱，管理类动作应该进入设置页。上一阶段已经把设置页服务器编辑能力补齐，本阶段把侧边栏中重复的服务器可见性管理控件移除。

## 变更

- `src/components/common/AppSidebar.vue`
  - 移除侧边栏“显示哪些服务器”折叠面板。
  - 移除每个服务器行尾部的隐藏按钮。
  - 侧边栏服务器区只保留服务器状态、登录状态与快速切换。
  - 当全部服务器被隐藏时，只提示可在设置中恢复显示。
  - 删除对应的临时状态、事件函数和 CSS。

## 验证

- 通过：`rg -n "showVisibility|visibility|srv-row__minus|toggleHidden|管理可见性|显示哪些服务器|马上添加" src\components\common\AppSidebar.vue`
  - 没有残留匹配。
- 通过：`npm.cmd run build`
  - 包含本机解码门禁、无计划 UI 检查、TypeScript 检查与 Vite 构建。

## 风险

- 服务器隐藏 / 显示能力没有删除，仍在设置页服务器面板中提供。
- 本阶段只清理主界面入口，不改服务器数据模型或登录逻辑。

## 回滚

- 还原 `src/components/common/AppSidebar.vue`，并删除本日志即可。
