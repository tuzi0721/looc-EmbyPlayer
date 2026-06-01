# 当前状态快照瘦身

## 背景

`docs/CURRENT_STATE.md` 已经变成 700 多行历史流水，里面保留了大量早期能力边界和旧验证记录。虽然代码和最新阶段已经清理了对应入口，但这个文件名叫“当前状态”，继续堆放历史会误导后续判断。

## 变更

- 将 `docs/CURRENT_STATE.md` 改为当前事实快照，只保留运行壳、播放核心、本机解码硬约束、文件连接器、验证入口、工作区清理状态和下一步风险。
- 历史细节继续由 `docs/CHANGE_LOG/` 承担，不再塞进当前状态快照。
- 明确写入当前忽略目录清单，便于继续清理无关文件时先区分构建产物和测试登录态。

## 验证

- 通过：`npm.cmd run check:local-decode`
- 通过：`npm.cmd run check:no-planned-ui`
- 通过：`npm.cmd run build`
- 通过：`git diff --check`
- 通过：`rg -n "待接入|计划中|未接入|未实现|敬请期待|not implemented|coming soon|no-op|fake|mock|demo|placeholder" docs\CURRENT_STATE.md` 无命中。
- 通过：构建后未发现 `mpv.exe`、`electron_mpv_host.exe` 或 `Hills Lite` 残留进程。

## 风险

- 本阶段是文档瘦身，不改变运行时代码；如需要追溯历史阶段，应查看对应 changelog。
