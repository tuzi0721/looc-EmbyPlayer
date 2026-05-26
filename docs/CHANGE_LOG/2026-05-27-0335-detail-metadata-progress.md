# Detail metadata and episode progress enhancement

- Time: 2026-05-27 03:35 (UTC+8)
- Motivation: improve DetailView information density by showing media type, genre tags, and episode watch progress while ensuring Emby/Jellyfin returns the required fields.
- Changed files:
  - `src-tauri/src/emby/client.rs` - append `Fields` for item details and include `SeriesInfo` in episode list requests.
  - `src-tauri/src/emby/models.rs` - add `Genres` / `GenreItems` to `MediaItem` and introduce the `NameIdPair` model.
  - `src/types/models.ts` - sync frontend `MediaItem` / `NameIdPair` type definitions.
  - `src/views/DetailView.vue` - add hero media/genre tags, episode resume progress bars, and matching styles.
- Risk: low. New fields are optional or defaulted; UI additions are hidden when data is missing; playback commands and route behavior are unchanged.
- Rollback: revert the four code files above and remove this changelog.
- Verification:
  1. `npm --prefix emby-player run build`
  2. `cargo check --manifest-path emby-player/src-tauri/Cargo.toml`
- Result: frontend type check and production build passed; Tauri/Rust `cargo check` passed.
