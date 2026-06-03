# 2026-06-03 18:18 - Tauri native fullscreen command

## Context

- The frontend already called `api.setFullscreen(...)`.
- Electron implemented this command, but the Tauri backend did not expose/register `set_fullscreen`.
- In the Tauri release, the player therefore fell back to document fullscreen, which matched the reported "pseudo fullscreen" behavior.

## Changes

- Added Tauri `set_fullscreen(window, enabled)` command.
- Registered it in the Tauri invoke handler.
- The command calls native `window.set_fullscreen(enabled)` and returns the actual fullscreen state.

## Verification

- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`

## Next

- Rebuild release after the current batch, then continue the remaining menu/layout issues.
