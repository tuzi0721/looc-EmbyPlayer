# MPV / 启动闪退 / 品牌对齐 — 代码修复

- **时间**：2026-05-25 22:30 (UTC+8)
- **动机**：全量审计后按最佳实践修复 G3–G5、G8、G10、G1/G2；解决 crash.log 中 rustls CryptoProvider panic（打开闪退根因）

---

## 修改文件（摘要）

### 后端 Rust

| 文件 | 变更 |
|---|---|
| `build.rs` | 下载 zhongfly mpv 7z → `vendor/mpv/` → 复制到 `target/*/resources/mpv/` |
| `Cargo.toml` | build-deps: reqwest+sevenz-rust；deps: which, open, rustls+ring |
| `mpv/paths.rs` | **新建** `resolve_mpv_exe()` / `mpv_exists()` |
| `mpv/ipc.rs` | **重写**：`--input-ipc-server` 命名管道 + split IO；接入 hwdec/cache 设置 |
| `commands/player.rs` | 新增 `detect_mpv`, `open_external` |
| `lib.rs` | 注册新命令；**rustls ring CryptoProvider 启动安装** |
| `tray/mod.rs` | 品牌 Hills Lite |
| `tauri.conf.json` | productName/title → Hills Lite；`bundle.active: false` |

### 前端

| 文件 | 变更 |
|---|---|
| `api/index.ts` | detectMpv / openExternal |
| `App.vue` | 挂载 MpvBanner |
| `router/index.ts` | `/favorites` `/aggregate` |
| `AppSidebar.vue` | Hills Lite + 收藏/聚合导航 |
| `PlayerView.vue` | back() fire-and-forget stop |
| `stores/library.ts` | searching / clearSearch（修 TopBar TS） |
| `MpvBanner.vue` | 对齐 detectMpv 返回类型 |
| 品牌字符串 | index.html, SettingsView, RemoteControlView |

### 文档

| 文件 | 变更 |
|---|---|
| `docs/PROJECT_MEMORY.md` | 主索引 + G1–G13 |
| `docs/STANDARDS.md` | 协作规范 |
| `docs/AUDIT_FULL_2026-05-25.md` | 全量审计 |
| `docs/CURRENT_STATE.md` | 重写快照 |
| `docs/ROADMAP/gap-alignment.md` | 修复路线图 |
| `.gitignore` | 忽略 `src-tauri/vendor/` |

---

## 风险

- build.rs 首次编译需联网下载 ~31MB mpv 7z
- mpv IPC 管道改动需播放回归
- rustls ring 与系统 FIPS 策略冲突（极罕见）

---

## 回滚

```powershell
git checkout HEAD -- src-tauri/ src/ docs/ index.html .gitignore
Remove-Item -Recurse -Force src-tauri/vendor -ErrorAction SilentlyContinue
```

---

## 验证步骤

1. `cargo build --release` 成功
2. 存在 `vendor/mpv/mpv.exe` 与 `target/release/resources/mpv/mpv.exe`
3. 启动 `target/release/emby-player.exe` → 5s 内进程仍在、crash.log 无新 panic
4. Sidebar 显示 Hills Lite；收藏/聚合可点
5. `detect_mpv` 返回 found=true（bundled）

---

## 结果

- ✅ Release 编译通过（mpv 113MB 已下载）
- ✅ rustls panic 已定位并修复（待复测）
- ⏳ G11 收藏 API、G9 用户侧完整验收待续
