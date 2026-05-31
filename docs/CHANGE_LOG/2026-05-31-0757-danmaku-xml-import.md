# 2026-05-31 07:57 - 外部 XML 弹幕导入闭环

## 摘要
- 播放器弹幕菜单新增“导入 XML”入口，用户可选择本地 XML 文件并直接载入当前播放页弹幕层。
- Electron、Tauri 和 Web Preview 三套平台层都已接入同名 `import_danmaku_xml` 命令，避免渲染层出现只在某一运行时可用的断档。
- 新增本地 XML 解析器，支持常见 `<d p="time,mode,size,color,...">text</d>` 格式，解析滚动/顶部/底部/逆向模式、颜色、时间轴与 XML 实体。

## 主要改动
- `electron/backend/danmaku.mjs`：新增 `parseDanmakuXml()` 与 `DanmakuClient.importXml()`，从文件名生成本地 episode id。
- `electron/main.mjs`：接入 `import_danmaku_xml` 命令 handler。
- `src/api/index.ts`、`src/views/PlayerView.vue`：播放器弹幕菜单接入文件选择和导入后状态刷新。
- `src-tauri/src/danmaku/xml.rs`、`src-tauri/src/commands/danmaku.rs`、`src-tauri/src/lib.rs`：补齐 Tauri 解析、命令参数和 invoke handler 注册。
- `src/platform/index.ts`：Web Preview fallback 返回空 XML 结果，保证浏览器预览命令覆盖一致。

## 验证
- `node --check electron\backend\danmaku.mjs`
- `node --check electron\main.mjs`
- Node XML 解析 smoke：2 条样例弹幕解析为 `provider=xml`，实体 `&amp;` 正确解码，顶部模式与 `#ff0000` 颜色正确。
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run check:electron-commands`：87 个 renderer 命令、83 个 Electron handler、4 个显式 no-op 覆盖通过。
- `npm.cmd run build`
- 本阶段触碰文件行尾空白检查：无新增命中。
- `npm.cmd run electron:build`：Electron unpacked 构建通过，`check:electron-package` 确认 6 个随包 mpv 文件进入 `release-electron\win-unpacked\resources\mpv`。

## 备注
- 本阶段没有写入测试账号、token 或完整媒体流 URL。
- 这不是播放线路/媒体源切换主目标的最终闭环，只是收拢上一小阶段已开始的弹幕 XML 导入改动，避免半成品影响后续构建和验收。
