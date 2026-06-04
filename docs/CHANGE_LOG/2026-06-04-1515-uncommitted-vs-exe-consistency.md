# 2026-06-04 15:15 - Uncommitted working tree vs exe/code consistency

## Scope

- Diagnostic round only. No product code changed.
- Goal: determine what the uncommitted working-tree changes actually are, and whether the current release exe matches the committed source.

## Findings

- `git status` listed 16 files as `modified`:
  - `package.json`, `src-tauri/src/commands/download.rs`, `src-tauri/src/config/store.rs`,
    `src-tauri/src/emby/client.rs`, `src-tauri/src/emby/models.rs`,
    `src-tauri/src/emby/session_controller.rs`, `src-tauri/src/mpv/backend.rs`,
    `src-tauri/src/mpv/embedded.rs`, `src-tauri/src/notifications/center.rs`,
    `src-tauri/src/state.rs`, `src/components/common/ToastStack.vue`, `src/main.ts`,
    `src/stores/notifications.ts`, `src/styles/glass.css`, `src/types/models.ts`,
    `src/views/DownloadsView.vue`.
- However `git diff --stat`, `git diff --numstat`, and `git diff --ignore-all-space --name-only` are all EMPTY.
- `core.autocrlf=true` and there is no `text`/`eol` normalization for these paths in `.gitattributes`
  (it only configures Git LFS for `mpv.exe` / `libmpv-2.dll`).
- Conclusion: the 16 "modified" files have ZERO content difference. They are CRLF/LF stat noise
  (the working-tree line endings differ from the stored blobs, but normalized content is identical).
  There are NO real uncommitted functional changes.

## Exe / code consistency

- HEAD: `280bfe1 Isolate mpv config and tighten window guard`, commit time `2026-06-04 12:01:15 +0800`.
- Release exe: `src-tauri/target/release/emby-player.exe`, last write `2026-06-04 11:57:34`, size `8,700,416` bytes.
- The exe size matches the size recorded in the `12:00` phase log for the `280bfe1` change, and was built
  just before the commit was finalized.
- Result: the current release exe corresponds to committed HEAD source. exe/code are consistent;
  the earlier "dirty working tree" concern was a false alarm caused by `autocrlf`.

## Recommendation

- Optional one-time cleanup: `git add --renormalize .` then commit, so future `git status` is clean and
  the CRLF/LF noise stops masking real changes. This is a separate decision and was NOT performed in this round.

## Next

- Proceed to the next round. Candidate target: the embedded mpv host/IPC lifecycle race that produces the
  full-flow black screen and `mpv ipc write failed: pipe is being closed`, which is the real unresolved
  playback failure (distinct from the passing command-only smoke).
