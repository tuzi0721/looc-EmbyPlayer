# Settings save stability fix

- Time: 2026-05-27 07:15 (UTC+8)
- Motivation: prevent fast settings edits, especially MPV executable path edits, from being overwritten by older asynchronous save responses or from triggering unnecessary MPV rebuilds while the user is still typing.
- Changed files:
  - `src/stores/settings.ts` - serialize `updateSettings` calls through a small drain queue, keep optimistic UI updates visible, and expose `saving` state for future UI use.
  - `src/views/SettingsView.vue` - use a local draft value for the MPV executable path and persist it on `change` / `blur` instead of every keystroke.
  - `src/components/common/GlassInput.vue` - forward native `change` and `blur` events with the current input value.
  - `src-tauri/src/commands/settings.rs` - distinguish an omitted `mpvExecutablePath` field from an explicit `null`, trim path values, clear empty values, and rebuild MPV only when backend/path settings actually change.
- Risk: low to medium. The save flow is intentionally serialized and optimistic, but all settings still use the same public `settings.update()` API; the MPV path field now saves on commit instead of per keystroke.
- Rollback: revert the four files above and remove this changelog entry.
- Verification:
  1. `npm --prefix emby-player run build`
  2. `cargo check --manifest-path emby-player/src-tauri/Cargo.toml`
  3. 500-line quick overwrite/fsync sandbox check under `A:\vsc\_sandbox_large_save_test`
- Result: frontend production build passed; Rust `cargo check` passed; small-file rapid overwrite/fsync check completed with `mismatches=0` and average forced-save time around 2.5ms, suggesting the observed issue is not a disk throughput bottleneck.