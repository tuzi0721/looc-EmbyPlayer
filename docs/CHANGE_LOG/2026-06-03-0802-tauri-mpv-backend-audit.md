# 2026-06-03 08:02 Tauri mpv backend audit

## Context

- The real visual smoke and user screenshot showed `mpv.exe` as an independent top-level window.
- That symptom does not match the intended Tauri `libmpv` embedded path, which should not spawn `mpv.exe`.

## Findings

- `src-tauri/src/mpv/manager.rs` still supports both `Ipc` and `Embedded` backends.
- `src/stores/settings.ts` still initializes frontend settings with `mpvBackend: "ipc"`.
- `src/views/SettingsView.vue` still exposes a user-facing IPC/embedded backend selector.
- `scripts/real-server-visual-smoke.mjs` only updates theme during setup and does not force `mpvBackend: "embedded"`.
- `PlayerView.vue` calls `embedAttach()` before playback, so an independent top-level `mpv.exe` points to the wrong backend/path rather than a normal player-layout issue.
- `MpvEmbeddedBackend::shutdown()` currently stops its event thread and hides the host window, but does not send `stop/quit` or destroy the native child host.
- `MpvManager::detach_embedded()` hides the embedded host, but does not stop playback or destroy the embedded host.

## Next

- Make Tauri embedded builds normalize persisted/runtime settings to `Embedded`.
- Remove the frontend's IPC default/selector for this app path.
- Strengthen embedded stop/detach/shutdown cleanup.
- Add smoke setup assertion that Tauri mode is running with `mpvBackend: "embedded"`.
