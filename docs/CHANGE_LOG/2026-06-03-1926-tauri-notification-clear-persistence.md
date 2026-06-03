# 2026-06-03 19:26 - Tauri notification clear persistence

## Changed
- Added cleared-notification source-key persistence to the Tauri notification path.
- `clear_notifications` now records source keys for existing notifications and stores a clear timestamp.
- `dismiss_notification` now remembers the dismissed notification source key when available.
- New notifications with the same `category + sourceId + kind + title + action` key are suppressed after clear/dismiss, preventing old download/login/server notifications from reappearing after relogin or restart.
- Existing persisted notifications are filtered against cleared keys when the Tauri `NotificationCenter` starts.

## Verification
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next
- Commit/push this phase, then rebuild the packaged release exe so the Tauri notification persistence fix is included in the user-facing binary.
