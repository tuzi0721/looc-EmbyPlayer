# 2026-06-01 16:28 首页巨幕默认与比例修正

## 动机
- 用户反馈首页巨幕没有真正呈现“巨幕”观感，比例偏小，下面留白过多。
- 之前真实媒体池已经接入，但默认设置仍是 `classic`，会让新装或 Web Preview 默认看到较小 Hero。

## 变更
- Electron、Web Preview、Tauri 和前端 settings store 的 `homeHeroStyle` 默认值统一改为 `cinema`。
- `HeroCarousel` fallback 改为 `cinema`，避免设置缺失时退回小尺寸。
- 首页 Hero 标准/巨幕模式整体加高，海报卡放大，标题字号上调，简介可读性提高。
- 巨幕模式内容与海报的底部定位从偏大的 `12vh` 收敛到更稳定的范围，减少下方空白，同时保留下方继续观看区域的首屏露出。

## 风险
- 已经手动选择过“标准”的用户会保留标准模式；不过标准模式本身也比旧版更高，避免继续出现过小第一屏。

## 验证
- 通过：`node --check electron\backend\store.mjs`。
- 通过：`cargo fmt --manifest-path src-tauri\Cargo.toml --check`。
- 通过：`cargo check --manifest-path src-tauri\Cargo.toml --all-targets`。
- 通过：`npm.cmd run build`。
- 通过：`git diff --check`。
- 通过：本地 Vite 预览服务已在 `127.0.0.1:1420` 运行，`/` 与 `/src/components/common/HeroCarousel.vue` 均返回 HTTP 200。
- 通过：`npm.cmd run electron:build`，包含 Electron command coverage、Vite build、`electron_mpv_host` release 编译、Electron unpacked 打包与随包 mpv/package 完整性检查。
- 限制：in-app Browser 插件本轮返回“没有可用浏览器路由”，未能完成截图目检。

## 回滚
- 将默认 `homeHeroStyle` 改回 `classic`，并回退 `HeroCarousel.vue` 的尺寸与定位调整。
