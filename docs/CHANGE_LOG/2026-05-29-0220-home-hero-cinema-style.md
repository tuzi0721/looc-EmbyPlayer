# Home hero cinema style

- **Time**: 2026-05-29 02:20 (UTC+8)
- **Motivation**: let users switch the home carousel from the standard banner to a larger cinema-style hero from Settings > Media Library.
- **Changed files**:
  - `electron/backend/store.mjs`, `src/stores/settings.ts`, `src/types/models.ts`, `src-tauri/src/config/models.rs` - add persisted `homeHeroStyle` / `home_hero_style` with `classic` and `cinema` values.
  - `src/views/SettingsView.vue` - add a Media Library settings panel with an "首页轮播图风格" segmented control for 标准 / 巨幕.
  - `src/components/common/HeroCarousel.vue` - apply the selected hero style, request wider backdrop images in cinema mode, enlarge and reposition the hero content, and fix base URL slash joining for backdrop URLs.
  - `docs/CURRENT_STATE.md` - record this home-carousel style increment.
- **Risk**: low. The default remains `classic`; cinema mode only changes layout and requested image width after the user switches it on.
- **Rollback**: revert this changelog, the settings/default additions, the settings panel, the hero style changes, and the `CURRENT_STATE.md` entry.
- **Verification**:
  1. `node --check electron/backend/store.mjs`
  2. `npm.cmd run build`
  3. `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  4. `rg -n "[ \t]+$" electron/backend/store.mjs src/stores/settings.ts src/types/models.ts src-tauri/src/config/models.rs src/views/SettingsView.vue src/components/common/HeroCarousel.vue docs/CURRENT_STATE.md docs/CHANGE_LOG/2026-05-29-0220-home-hero-cinema-style.md`
  5. `npm.cmd run electron:build`
- **Result**: passed.
