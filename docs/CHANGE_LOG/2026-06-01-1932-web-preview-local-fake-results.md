# 2026-06-01 19:32 Web Preview 本地假结果清理

## 背景

Web Preview 仍有两个本地能力在浏览器中无法真实执行，却返回了看似正常的数据：本地文件夹列表返回空目录，导入弹幕 XML 返回空弹幕结果。这会让用户误以为目录确实为空、弹幕确实没有内容。

## 变更

- `list_local_folder` 在 Web Preview 中改为明确失败，不再把任意本地目录伪装成空目录。
- `import_danmaku_xml` 在 Web Preview 中改为明确失败，不再返回 `{ provider: "xml", comments: [] }` 这种假成功。
- WebDAV / Alist 的浏览器可执行网络访问路径保持不变。

## 验证

- `npm.cmd run build`
- `git diff --check`
- `npm.cmd run electron:build`
