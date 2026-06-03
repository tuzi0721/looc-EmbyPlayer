# 2026-06-03 17:57 - window close waits for runtime cleanup

## Context

- The most severe reported issue was that closing or exiting the app could leave playback running in the background.
- Electron already had a shared `cleanupRuntime()` path that clears desktop state, stops blackout windows, unregisters shortcuts, shuts down mpv, and destroys the embedded host.
- The main window `close` event only started that async cleanup and then allowed the window lifecycle to continue immediately.

## Changes

- Added guarded main-window close state so the first close request prevents the default close.
- The close path now waits for `cleanupRuntime("window-close")` to settle before destroying the main window and quitting the app on Windows/Linux.
- Repeated close requests while cleanup is in progress are ignored instead of starting duplicate shutdown work.

## Verification

- `node --check electron\main.mjs`
- `npm.cmd run build`
- `git diff --check`

## Next

- Continue with the next highest-impact reported issue after this commit/push, keeping each small phase logged before moving on.
