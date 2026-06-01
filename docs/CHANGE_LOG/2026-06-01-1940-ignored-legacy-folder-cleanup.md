# 2026-06-01 19:40 忽略目录残留清理

## 背景

源码已切到内置 `src-tauri/resources/mpv` 作为 mpv 唯一来源，但工作区里仍有被 `.gitignore` 静默隐藏的旧 `src-tauri/vendor/` 目录，里面包含历史 mpv 下载包和解压目录。工作区还残留了 `.cunzhi-memory/` 本地助手记忆目录，不属于产品代码。

## 变更

- 删除忽略目录 `src-tauri/vendor/`，清掉旧 `mpv-win-x86_64.7z`、`mpv/` 与 `mpv-extract/`。
- 删除忽略目录 `.cunzhi-memory/`，避免本地助手工具数据留在项目目录。
- 从 `.gitignore` 移除 `.cunzhi-memory/` 与 `/src-tauri/vendor/` 静默忽略项；如果这些目录后续再次出现，会直接暴露在 `git status` 里。

## 验证

- `Test-Path -LiteralPath src-tauri\vendor` 返回 `False`
- `Test-Path -LiteralPath .cunzhi-memory` 返回 `False`
- `git status --short --ignored`
- 源码引用扫描确认当前产品代码不引用 `src-tauri/vendor` 或 `.cunzhi-memory`
