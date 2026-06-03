# 2026-06-03 18:26 - Tauri remove native menu

## Context

- The reported UI issue said the native `File/Edit` menu bar had no value and should not exist.
- Electron already removes its application/window menus.
- Tauri did not explicitly remove/hide its app/window menu during setup.

## Changes

- During Tauri setup, remove and hide the app-wide menu.
- Also remove and hide the `main` webview window menu when present.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next

- Rebuild release after the current batch and continue layout checks.
