# Web Preview 真实登录与服务器追加修正

## 背景

用户指出当前设置页虽然能打开添加服务器弹窗，但实际体验仍像没有真正登录：媒体库不能识别，新增服务器看起来会把原来的服务器挤掉，线路测活还出现不可信的 `1ms`。

## 改动

- Web Preview 的服务器探测、登录、媒体库视图、继续观看、列表、详情、搜索、剧集、相似内容与附加内容改为请求真实 Emby/Jellyfin API。
- Vite dev server 新增本地 `/__hills_web_proxy`，用于浏览器预览绕过 CORS 和受限请求头问题。
- Web Preview 的线路测活改为真实请求 `/System/Info/Public` 并记录实际耗时，不再返回固定假延迟。
- Web Preview 的服务器、账号、活动账号与设置写入本地 `localStorage`，刷新页面后不会丢失刚添加的服务器或登录态；不保存密码。
- 设置页接入 `AddServerDialog` 的 `created` 事件，新增服务器后立即刷新服务器列表；如果本次同时登录，也刷新账号态和首页媒体库。

## 验证

- `npm.cmd run build`
- `node --check electron\main.mjs`
- `node --check scripts\smoke-electron-embedded-local.mjs`
- `npm.cmd run check:electron-commands`

## 结果

本阶段已把浏览器预览从“内存假登录/假延迟/空媒体库”推进到真实 API 链路，并修正设置页新增服务器后的刷新体验。验证过程中未写入测试账号、密码、token 或完整播放地址。
