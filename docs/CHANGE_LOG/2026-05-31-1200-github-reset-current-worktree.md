# GitHub 远端内容替换准备

## 背景

用户确认 GitHub 仓库中现有文件整体为错误内容，需要舍弃，并以当前本地 `A:\vsc\emby-player` 工作树作为新的可信版本提交到 `tuzi0721/looc-EmbyPlayer`。

## 处理

- 复核本地 Git 元数据仍在 `.git_disabled`，远端指向 `https://github.com/tuzi0721/looc-EmbyPlayer.git`，分支为 `main`。
- Windows 当前拒绝将 `.git_disabled` 重命名回 `.git`，因此本阶段改用 `git --git-dir=.git_disabled --work-tree=.` 继续完成提交链路。
- 复核 `.gitignore` 已排除 `node_modules`、`dist`、`release-electron`、`.electron-user-data`、`.electron-builder-cache`、Tauri target 和日志文件，避免把构建产物、运行数据和本地缓存推到远端。
- 提交前继续保持敏感信息约束：不把测试账号、密码、token 或完整播放 URL 写入仓库。

## 下一步

使用当前工作树生成一次验证后的提交，并强制更新远端 `main`，使 GitHub 以本地版本为准。
