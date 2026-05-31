# 2026-05-31 07:16 服务器线路高级配置

## 目标

把已经存在于模型里的线路 `userAgent` 与自定义 headers 做成用户可操作入口，避免反代 / 私有服务需要特殊请求头时只能依赖导入配置或手工改状态文件。

## 改动

- 新增 `src/utils/headerText.ts`，统一把多行 `Name: Value` 文本解析为 headers 数组，并支持把已保存 headers 还原为文本。
- 添加服务器弹窗新增默认 User-Agent、单线路 User-Agent 与 headers 高级项。
- 设置页“媒体库 / 服务器”支持编辑已保存服务器的默认 User-Agent、线路名称、URL、启用状态、单线路 User-Agent 与 headers。
- 更新已保存服务器时会带回线路 id，避免 Electron 更新线路配置后生成新 id 并丢失当前 active line。
- Tauri `update_server` 兼容清空 `defaultUserAgent`，并优先按 line id 保留已有线路状态。

## 验证

已通过：

```powershell
npm.cmd run build
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
npm.cmd run check:electron-commands
npm.cmd run electron:build
rg -n "[ \t]+$" src\utils\headerText.ts src\components\login\AddServerDialog.vue src\views\SettingsView.vue src\api\index.ts src\stores\server.ts src-tauri\src\commands\server.rs
```

浏览器验证：

- Vite dev server 打开 `http://127.0.0.1:1420/settings?c=servers` 成功。
- 添加服务器弹窗可见默认 User-Agent、线路高级项、User-Agent 与 headers 输入。
- 输入 `Mozilla/5.0 Hills Smoke`、`Line UA`、`X-Test: 1` 后 UI 无挤压重叠。
- in-app Browser 控制台 error 数为 0。

## 说明

- Web 预览环境没有实现 `add_server`，因此浏览器只做视觉与输入冒烟；真实保存链路由 Electron/Tauri 命令与构建检查覆盖。
- 本轮没有写入测试服务器账号、密码或 token。
