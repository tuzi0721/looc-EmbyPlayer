# 2026-06-04 10:59 - Notification Clear Persistence

## Changed

- Tauri notification startup now honors both `cleared_notification_keys` and `notifications_cleared_at`, matching the Electron store behavior and preventing old sourceless/system notifications from coming back after the user clears the center.
- Repeated keyed notifications now reuse the existing notification id/read state before replacing the stored item, so frontend listeners can update in place instead of accumulating duplicate unread rows.
- The Pinia notification store now only increments unread/toast queues for genuinely new notifications, and updates existing local rows without spawning another toast.

## Verification

- `cargo test --manifest-path src-tauri\Cargo.toml notifications::center`
- `cargo check --manifest-path src-tauri\Cargo.toml --all-targets`
- `npm.cmd run build`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `git diff --check`

## Notes

- This phase is a focused notification-center persistence fix. It did not rerun the full real-account playback smoke because no playback path changed.
