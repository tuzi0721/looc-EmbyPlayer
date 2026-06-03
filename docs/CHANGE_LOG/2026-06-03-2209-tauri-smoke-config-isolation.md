# 2026-06-03 22:09 - Tauri smoke config isolation

## What changed

- Added `HILLS_CONFIG_STORE_PATH` support to the Tauri `ConfigStore` loader.
- Updated `scripts/real-server-visual-smoke.mjs` Tauri dev/release launch environments to pass a temporary `config.json` path under the smoke temp directory.

## Why

The first real-account `HILLS_REAL_PERSONAL_ONLY=1` run failed before product assertions:

- It logged into the second real server line successfully.
- `list_accounts` then reported 56 accounts, meaning the Tauri release smoke run was reading old app configuration instead of an isolated temporary config.
- `list_items_all_accounts` timed out because it was querying that polluted account set.

The smoke runner must not touch or depend on the user's real app configuration when validating product behavior.

## Verification

- Failed pre-fix real run: `HILLS_REAL_PERSONAL_ONLY=1` reached second-line login, then `list_items_all_accounts timed out in page bridge` with 56 accounts.
- `node --check scripts\real-server-visual-smoke.mjs`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo check --manifest-path src-tauri\Cargo.toml --features mpv-embedded --offline`
- `npm.cmd run build`
- `git diff --check`

## Next

- Rebuild the packaged Tauri release so it contains `HILLS_CONFIG_STORE_PATH`, then rerun the real personal-media guard.
