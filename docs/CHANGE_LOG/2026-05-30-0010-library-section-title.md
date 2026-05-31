# 2026-05-30 00:10 媒体库分区标题常显

## 目标

进入具体媒体库分区后，顶部导航栏不再固定显示“媒体库”，而是常显当前分区名称，方便用户确认正在浏览哪一个库。

## 变更

- `LibraryView.vue` 新增 `currentView` / `libraryTitle`，从已加载的媒体库视图中解析当前分区名称。
- 直达 `/library/:id` 且视图缓存为空时，加载媒体条目的同时并行补拉一次首页视图元数据。
- 顶部 `GlassNavBar` 标题改为当前媒体库名称，并为长名称增加单行省略和 hover title。

## 验证

已通过：

```powershell
LibraryView currentView / libraryTitle / refreshHome 落点检查
固定“媒体库”标题残留检查
行尾空白检查
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 通过；Electron builder 仍输出既有 duplicate dependency references 和 Node DEP0190 提示。未在真实媒体库数据下做人工视觉目检。

## 当前状态

- 媒体库页会常显当前分区标题。
- 直接打开媒体库路由也会尽量补齐分区标题数据。
- 分区标题过长时会在导航栏中保持单行省略。
