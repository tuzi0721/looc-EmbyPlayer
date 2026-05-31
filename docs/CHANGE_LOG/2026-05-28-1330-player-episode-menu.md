# Player episode menu

- **Time**: 2026-05-28 13:30 (UTC+8)
- **Motivation**: make the player episode-list control usable so series playback can jump between queued episodes without leaving the player.
- **Changed files**:
  - `src/views/PlayerView.vue` - add a queue-backed episode popup, load missing queue item details on demand, highlight the current episode, and switch playback when the user picks another episode.
  - `src/views/PlayerView.vue` - derive the player title from the current `player.itemId` so title/subtitle update after next/previous/episode-menu playback changes.
  - `docs/CURRENT_STATE.md` - record the player episode menu as the latest player usability update.
- **Risk**: low to medium. The menu depends on the existing playback queue populated from the detail page; standalone playback disables the control instead of showing an empty panel.
- **Rollback**: remove the episode popup and current-item title binding, then restore this changelog entry and `docs/CURRENT_STATE.md`.
- **Verification**:
  1. `npm.cmd run build`
  2. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  3. `git diff --check`
- **Result**: passed.
