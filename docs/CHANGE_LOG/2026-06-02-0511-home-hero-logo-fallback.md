# 2026-06-02 05:11 - 首页巨幕 Logo 与父级图回退
## 变更

- 首页巨幕标题支持 Emby/Jellyfin `Logo` 图片；有艺术标题图时优先显示 Logo，保留文字标题作为可访问与失败回退。
- 巨幕背景图候选从自身 Backdrop/Primary 扩展到父级/系列 Backdrop、Thumb 和 Primary，单集作为巨幕候选时不再容易灰底。
- 媒体图片协议允许 `Logo` 类型，Electron、Web 兼容层和 Tauri 兼容模型同步 `ParentLogoItemId` / `ParentLogoImageTag` 字段。
- 首页媒体候选请求的 `EnableImageTypes` 扩展为 `Primary,Backdrop,Thumb,Logo`，并请求父级 Logo 字段。
- 首页 smoke 的假 Emby 媒体加入 `ImageTags.Logo`，断言 `.hero__logo.loaded` 且 `naturalWidth > 0`。

## 验证

- `node --check scripts\smoke-electron-home-hero.mjs`
- `node --check electron\backend\emby.mjs`
- `node --check electron\main.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `node scripts\smoke-electron-home-hero.mjs`
- `git diff --check`
