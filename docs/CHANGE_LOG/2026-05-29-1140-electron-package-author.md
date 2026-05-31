# 2026-05-29 11:40 Electron 打包 author 元数据

## 目标

清理 Electron builder 打包时的 `author is missed in the package.json` 噪声，让打包输出更容易看出真正需要处理的问题。

## 变更

- `package.json` 新增 `author: "Hills Lite Contributors"`。
- 不改动依赖与 package-lock，避免引入无关锁文件变化。

## 验证

已通过：

```powershell
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); if(p.author!=='Hills Lite Contributors') process.exit(1); console.log(p.author)"
Select-String -Path package.json -Pattern 'Hills Lite Contributors'
rg "[ \t]+$" package.json
npm.cmd run build
npm.cmd run electron:build
```

说明：`npm.cmd run electron:build` 已不再输出 `author is missed in the package.json`；仍存在既有的 duplicate dependency references 和 Node DEP0190 提示。PlayerView chunk 仍低于 500 kB。

## 当前状态

- Electron 打包元数据补齐 author。
- author 缺失警告已清除。
- 其余 Electron builder 提示留待后续单独处理。
