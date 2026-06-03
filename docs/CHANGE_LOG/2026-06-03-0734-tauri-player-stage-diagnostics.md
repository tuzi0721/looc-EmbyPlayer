# 2026-06-03 07:34 Tauri player stage diagnostics

## 背景
- 最新 release 真实 smoke 仍在播放器 `get_state` 阶段超时。
- 需要确认 Tauri `play` 命令卡在哪个后端阶段，而不是继续凭截图猜测。

## 本阶段修改
- `src-tauri/src/commands/player.rs`
  - 在 `HILLS_TAURI_CDP_PORT` 存在时，将 Tauri player 阶段诊断写入 `LOCALAPPDATA\EmbyPlayer\visual-smoke.log`。
  - 诊断阶段包括 active account、server、item、PlaybackInfo、source selection、stream URL ready、mpv load start/complete、subtitle style、session stored、play return、get_state start/complete/error。
  - 日志不写 URL、token、用户名或密码。

## 验证
- `cargo fmt --manifest-path src-tauri\Cargo.toml`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## 结果
- Rust check 通过。
- 下一步刷新 release exe 并用真实账号重跑，读取后端阶段日志。
