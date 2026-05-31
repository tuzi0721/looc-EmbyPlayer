# 2026-05-30 03:00 Tauri 随包 mpv 构建固定化

## 目标

把 Tauri 构建链也收敛到“应用自带完整 mpv”的模型：构建时只复制仓库内置资源，不再读取本机 mpv 目录或从网络下载 mpv。

## 变更

- `src-tauri/build.rs` 改为只从 `src-tauri/resources/mpv` 复制 mpv 到 `target/<profile>/resources/mpv`。
- 随包 mpv 缺失或复制失败时，Tauri build script 现在会直接失败，不再降级成 cargo warning。
- 移除 `HILLS_LITE_MPV_DIR`、`vendor/mpv`、GitHub 7z 下载、`sevenz-rust` 解压等旧 bootstrap 路径。
- `src-tauri/Cargo.toml` 移除 build-dependencies 中的 `reqwest` blocking 和 `sevenz-rust`，并清理旧 “PATH fallback / mpv install page” 注释。
- `src-tauri/Cargo.lock` 同步移除不再需要的 7z / which / build-time download 相关依赖。
- `docs/STANDARDS.md`、`docs/PROJECT_MEMORY.md`、`docs/ROADMAP/gap-alignment.md` 更新为内置 mpv 唯一模型，明确禁止恢复本机检测、下载引导和路径选择。

## 验证

已通过：

```powershell
旧下载/本机路径残留检查
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo check --manifest-path src-tauri\Cargo.toml --all-targets
Tauri debug runtime mpv 复制检查
cargo build --manifest-path src-tauri\Cargo.toml --release
Tauri release runtime mpv 复制检查
行尾空白检查
npm.cmd run electron:build
```

结果：`cargo check` 触发 build script 后，`src-tauri\target\debug\resources\mpv\mpv.exe` 与 `mpv\fonts.conf` 存在；`cargo build --release` 通过后，`src-tauri\target\release\emby-player.exe` 与 `target\release\resources\mpv\mpv.exe` 存在，release 随包 mpv 目录含 6 个文件；随包复制失败路径已改为 `panic!("bundled mpv copy failed: ...")`；旧的 `HILLS_LITE_MPV_DIR`、`vendor/mpv`、`download_mpv`、`sevenz-rust`、`mpv-winbuild` 残留已清除。Electron 打包链仍按命令覆盖检查、Vite 构建、builder、打包完整性检查顺序通过。

## 当前状态

- Tauri 与 Electron 都只使用项目内置 mpv 资源。
- mpv 更新只随应用版本迭代进入仓库随包资源。
- 项目文档不再把本机 mpv 检测或构建期下载列为规范。
