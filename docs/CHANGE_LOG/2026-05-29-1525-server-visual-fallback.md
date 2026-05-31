# 2026-05-29 15:25 服务器图标 fallback 统一

## 目标

统一 Emby / Jellyfin 服务器入口的图标与活动线路解析，避免侧边栏、首页登录卡片各自维护一套连接器视觉逻辑。

## 变更

- 新增 `src/utils/serverVisuals.ts`，集中提供 `serverKindIcon()`、`serverKindLabel()` 和 `serverActiveLine()`。
- 侧边栏服务器项改用统一连接器头像，接入当前活动线路的 `LineStatusDot` 健康点。
- 首页未登录服务器卡片复用同一套 `serverKindIcon()` / `serverActiveLine()`，不再重复查找活动线路。
- 移除侧边栏服务器项里已经不用的播放图标样式。
- 启动期线路探测调用补充可选调用保护，避免开发态 HMR 旧 store 实例产生暂态报错。

## 验证

已通过：

```powershell
serverVisuals / AppSidebar / HomeView 落点检查
srv-row__play / serverInitial 残留检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

浏览器验证已通过：

- 打开 `http://127.0.0.1:5173/`。
- 确认 Hills Lite shell 与空服务器状态正常渲染。
- 验证开始后无新增 console error。

说明：当前 Web 预览无已保存服务器，因此本轮未目检真实服务器行里的连接器头像和健康点。`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。

## 当前状态

- 服务器连接器图标和活动线路解析已有统一工具。
- 侧边栏服务器行会显示连接器头像和线路健康点。
- 首页未登录服务器卡片与侧边栏使用一致的图标/线路 fallback。
